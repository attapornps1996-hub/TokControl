using System;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using TokControlREPOBridge.Commands;
using TokControlREPOBridge.Logging;

namespace TokControlREPOBridge.Network;

public sealed class WebSocketServer : IDisposable
{
    private readonly int _preferredPort;
    private readonly CommandProcessor _processor;
    private readonly CancellationTokenSource _cts = new();
    private HttpListener? _listener;
    private Task? _acceptTask;

    public int Port { get; private set; }

    public WebSocketServer(int port, CommandProcessor processor)
    {
        _preferredPort = port > 0 ? port : 8080;
        Port = _preferredPort;
        _processor = processor;
    }

    /// <summary>
    /// Bind IPv4 loopback only (127.0.0.1). Avoids clashing with other mods that grab ::1/localhost:8080.
    /// Falls back to alternate ports when the preferred port is taken.
    /// </summary>
    public void Start()
    {
        var candidates = BuildPortCandidates(_preferredPort);
        Exception? lastError = null;

        foreach (var port in candidates)
        {
            HttpListener? listener = null;
            try
            {
                listener = new HttpListener();
                // IPv4 only — do NOT add http://localhost: (that can bind ::1 and collide with StreamToEarn-style mods)
                listener.Prefixes.Add($"http://127.0.0.1:{port}/");
                listener.Start();

                _listener = listener;
                Port = port;
                _acceptTask = Task.Run(() => AcceptLoopAsync(_cts.Token));

                if (port != _preferredPort)
                {
                    ModLog.Warn($"Port {_preferredPort} was busy — TokControl bridge moved to ws://127.0.0.1:{port}/");
                    ModLog.Warn($"Set TokControl Connection URL to: ws://127.0.0.1:{port}/");
                }
                else
                {
                    ModLog.Info($"HTTP/WebSocket listener started on port {port} (127.0.0.1 only)");
                }
                return;
            }
            catch (Exception ex)
            {
                lastError = ex;
                try { listener?.Close(); } catch { /* ignore */ }
                ModLog.Warn($"Could not bind 127.0.0.1:{port} — {ex.Message}");
            }
        }

        throw new InvalidOperationException(
            $"TokControl bridge failed to bind any port (tried {string.Join(", ", candidates)}). Last error: {lastError?.Message}");
    }

    private static int[] BuildPortCandidates(int preferred)
    {
        // Prefer configured port, then common free alternates (skip typical StreamToEarn 8080 steal on ::1 —
        // we still try 8080 on 127.0.0.1 first because other mods often only bind IPv6).
        var list = new System.Collections.Generic.List<int> { preferred };
        foreach (var p in new[] { 8080, 8082, 8090, 18080, 28080 })
        {
            if (!list.Contains(p)) list.Add(p);
        }
        return list.ToArray();
    }

    private async Task AcceptLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _listener != null && _listener.IsListening)
        {
            HttpListenerContext? context = null;
            try
            {
                context = await _listener.GetContextAsync().ConfigureAwait(false);
            }
            catch (HttpListenerException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }
            catch (Exception ex)
            {
                ModLog.Warn($"Accept error: {ex.Message}");
                continue;
            }

            _ = Task.Run(() => HandleContextAsync(context, ct), ct);
        }
    }

    private async Task HandleContextAsync(HttpListenerContext context, CancellationToken ct)
    {
        try
        {
            if (context.Request.IsWebSocketRequest)
            {
                var wsContext = await context.AcceptWebSocketAsync(null).ConfigureAwait(false);
                await HandleWebSocketAsync(wsContext.WebSocket, ct).ConfigureAwait(false);
                return;
            }

            var path = context.Request.Url?.AbsolutePath ?? "/";
            string body;
            if (path.Equals("/health", StringComparison.OrdinalIgnoreCase))
            {
                body =
                    "{\"ok\":true,\"mod\":\"TokControl_REPO_Tiktoklive\",\"version\":\"" +
                    PluginInfo.PLUGIN_VERSION +
                    "\",\"port\":" + Port + "}";
            }
            else if (context.Request.HttpMethod == "POST")
            {
                using var reader = new System.IO.StreamReader(context.Request.InputStream, context.Request.ContentEncoding);
                var payload = await reader.ReadToEndAsync().ConfigureAwait(false);
                var result = _processor.Process(payload);
                body = result.ToJson();
            }
            else
            {
                body = "{\"ok\":true,\"mod\":\"TokControl_REPO_Tiktoklive\",\"hint\":\"Connect via WebSocket ws://127.0.0.1:" + Port + "/\"}";
            }

            var bytes = Encoding.UTF8.GetBytes(body);
            context.Response.StatusCode = 200;
            context.Response.ContentType = "application/json";
            context.Response.ContentLength64 = bytes.Length;
            await context.Response.OutputStream.WriteAsync(bytes, 0, bytes.Length, ct).ConfigureAwait(false);
            context.Response.Close();
        }
        catch (Exception ex)
        {
            ModLog.Warn($"Request handler error: {ex.Message}");
            try { context.Response.StatusCode = 500; context.Response.Close(); } catch { /* ignore */ }
        }
    }

    private async Task HandleWebSocketAsync(WebSocket socket, CancellationToken ct)
    {
        var buffer = new byte[8192];
        ModLog.Info("WebSocket client connected");

        try
        {
            while (socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), ct).ConfigureAwait(false);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    break;
                }

                if (result.MessageType != WebSocketMessageType.Text)
                {
                    continue;
                }

                var message = Encoding.UTF8.GetString(buffer, 0, result.Count);

                _ = Task.Run(() =>
                {
                    try
                    {
                        var response = _processor.Process(message);
                        var responseBytes = Encoding.UTF8.GetBytes(response.ToJson());
                        _ = socket.SendAsync(new ArraySegment<byte>(responseBytes), WebSocketMessageType.Text, true, ct);
                    }
                    catch (Exception ex)
                    {
                        ModLog.Warn($"WS message error: {ex.Message}");
                    }
                }, ct);
            }
        }
        catch (WebSocketException ex)
        {
            ModLog.Debug($"WebSocket closed: {ex.Message}");
        }
        catch (Exception ex)
        {
            ModLog.Warn($"WebSocket error: {ex.Message}");
        }
        finally
        {
            ModLog.Info("WebSocket client disconnected");
            try
            {
                if (socket.State == WebSocketState.Open || socket.State == WebSocketState.CloseReceived)
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None)
                        .ConfigureAwait(false);
                }
            }
            catch { /* ignore */ }

            socket.Dispose();
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _listener?.Stop(); } catch { /* ignore */ }
        try { _listener?.Close(); } catch { /* ignore */ }
        _listener = null;
        _cts.Dispose();
    }
}
