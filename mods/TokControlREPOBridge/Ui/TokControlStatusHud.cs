using System.Reflection;
using System.Text;
using TMPro;
using UnityEngine;

namespace TokControlREPOBridge.Ui;

internal sealed class TokControlStatusHud : MonoBehaviour
{
    private const float RefreshInterval = 0.4f;
    private const float LossRefreshInterval = 0.08f;
    private const float RepositionInterval = 1.5f;
    private const float LineHeight = 14f;
    private const float FontSize = 13f;

    private static TokControlStatusHud? _instance;

    private readonly MapValueAnimator _mapAnimator = new();

    private GameObject? _panelRoot;
    private TextMeshProUGUI? _label;
    private RectTransform? _panelRt;
    private RectTransform? _gameHudRt;
    private RectTransform? _taxHaulRt;
    private float _refreshTimer;
    private float _repositionTimer;
    private string _lastText = string.Empty;
    private int _trackedLevel = -1;
    private bool _wasInLevel;

    internal static void Ensure()
    {
        if (_instance != null) return;

        var go = new GameObject("TokControlStatusHud");
        DontDestroyOnLoad(go);
        _instance = go.AddComponent<TokControlStatusHud>();
    }

    private void Update()
    {
        var inLevel = IsInPlayableLevel();
        if (inLevel && !_wasInLevel)
        {
            _trackedLevel = GetLevelId();
            _mapAnimator.BeginLevel();
            HudStatsProvider.InvalidateCache();
        }
        else if (inLevel)
        {
            var levelId = GetLevelId();
            if (levelId != _trackedLevel)
            {
                _trackedLevel = levelId;
                _mapAnimator.BeginLevel();
                HudStatsProvider.InvalidateCache();
            }
        }
        else if (_wasInLevel)
        {
            _trackedLevel = -1;
            _mapAnimator.EndLevel();
            HudStatsProvider.InvalidateCache();
        }

        _wasInLevel = inLevel;

        if (!ShouldShowHud())
        {
            HidePanel();
            return;
        }

        if (!EnsurePanel())
        {
            HidePanel();
            return;
        }

        _repositionTimer -= Time.unscaledDeltaTime;
        if (_repositionTimer <= 0f)
        {
            _repositionTimer = RepositionInterval;
            RepositionBelowHudStack();
        }

        HudStatsProvider.TickCache();
        _mapAnimator.Tick(HudStatsProvider.GetMapValue(), Time.unscaledDeltaTime);

        var refreshInterval = _mapAnimator.IsAnimating ? LossRefreshInterval : RefreshInterval;
        _refreshTimer -= Time.unscaledDeltaTime;
        if (_refreshTimer > 0f && _panelRoot != null && _panelRoot.activeSelf) return;
        _refreshTimer = refreshInterval;

        var text = BuildStatusText();
        if (text == _lastText && _panelRoot != null && _panelRoot.activeSelf) return;

        _lastText = text;
        _label!.SetText(text);
        _panelRoot!.SetActive(true);
    }

    private string BuildStatusText()
    {
        var cartValue = HudStatsProvider.GetCartValue();
        var enemies = HudStatsProvider.GetEnemyCount();
        var hasCosmetics = HudStatsProvider.TryBuildCosmeticIconLine(out var cosmetics);

        var lineCount = 2;
        if (_mapAnimator.IsScanReady) lineCount++;
        lineCount++;
        if (hasCosmetics) lineCount++;

        if (_panelRt != null)
        {
            _panelRt.sizeDelta = new Vector2(168f, LineHeight * lineCount);
        }

        var sb = new StringBuilder();
        var mapLine = _mapAnimator.BuildMapLine();
        if (!string.IsNullOrEmpty(mapLine))
        {
            sb.AppendLine(mapLine);
        }

        sb.AppendLine($"C.A.R.T.: ${cartValue:N0}");
        sb.AppendLine($"MON: {enemies}");

        if (hasCosmetics)
        {
            sb.Append(cosmetics);
        }

        return sb.ToString().TrimEnd();
    }

    private static bool IsInPlayableLevel()
    {
        try
        {
            return !SemiFunc.MenuLevel() && SemiFunc.RunIsLevel();
        }
        catch
        {
            return RunManager.instance != null;
        }
    }

    private static int GetLevelId()
    {
        try
        {
            var level = RunManager.instance?.levelCurrent;
            return level == null ? -1 : level.GetHashCode();
        }
        catch
        {
            return -1;
        }
    }

    private static bool ShouldShowHud()
    {
        if (!IsInPlayableLevel()) return false;
        if (IsMapOpen()) return false;
        return true;
    }

    private static bool IsMapOpen()
    {
        try
        {
            if (SemiFunc.InputHold((InputKey)8)) return true;
        }
        catch
        {
            // ignore
        }

        if (Input.GetKey(KeyCode.Tab)) return true;

        try
        {
            if (MapToolController.instance == null) return false;
            var field = typeof(MapToolController).GetField("mapToggled",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field?.FieldType == typeof(bool))
            {
                return (bool)field.GetValue(MapToolController.instance);
            }
        }
        catch
        {
            // ignore
        }

        return false;
    }

    private bool EnsurePanel()
    {
        if (_panelRoot != null && _label != null && _panelRt != null) return true;

        var gameHud = GameObject.Find("Game Hud");
        var taxHaul = GameObject.Find("Tax Haul");
        if (gameHud == null || taxHaul == null) return false;

        var reference = taxHaul.GetComponent<TMP_Text>();
        if (reference == null || reference.font == null) return false;

        _gameHudRt = gameHud.GetComponent<RectTransform>();
        _taxHaulRt = taxHaul.GetComponent<RectTransform>();

        _panelRoot = new GameObject("TokControl Status HUD");
        _panelRoot.SetActive(false);
        _label = _panelRoot.AddComponent<TextMeshProUGUI>();
        _label.font = reference.font;
        _label.fontSize = FontSize;
        _label.lineSpacing = 0f;
        _label.paragraphSpacing = 0f;
        _label.enableWordWrapping = false;
        _label.alignment = TextAlignmentOptions.TopRight;
        _label.horizontalAlignment = HorizontalAlignmentOptions.Right;
        _label.verticalAlignment = VerticalAlignmentOptions.Top;
        _label.color = new Color(0.79f, 0.91f, 0.90f, 1f);
        _label.richText = true;
        _label.margin = new Vector4(0f, 0f, 0f, 0f);

        _panelRoot.transform.SetParent(gameHud.transform, false);
        _panelRt = _panelRoot.GetComponent<RectTransform>();
        _panelRt.anchorMin = new Vector2(1f, 1f);
        _panelRt.anchorMax = new Vector2(1f, 1f);
        _panelRt.pivot = new Vector2(1f, 1f);
        _panelRt.sizeDelta = new Vector2(168f, LineHeight * 4f);
        return true;
    }

    private void RepositionBelowHudStack()
    {
        if (_panelRt == null) return;

        if (_gameHudRt == null || _taxHaulRt == null)
        {
            var gameHud = GameObject.Find("Game Hud");
            var taxHaul = GameObject.Find("Tax Haul")?.GetComponent<RectTransform>();
            if (gameHud == null || taxHaul == null) return;
            _gameHudRt = gameHud.GetComponent<RectTransform>();
            _taxHaulRt = taxHaul;
        }

        var lowestY = _taxHaulRt!.anchoredPosition.y;
        foreach (var tmp in _gameHudRt!.GetComponentsInChildren<TMP_Text>(true))
        {
            if (tmp == null || tmp == _label) continue;
            if (tmp.gameObject.name.StartsWith("TokControl")) continue;
            if (!tmp.gameObject.activeInHierarchy) continue;

            var rt = tmp.GetComponent<RectTransform>();
            if (rt == null) continue;
            if (rt.anchorMax.x < 0.55f) continue;

            var bottom = rt.anchoredPosition.y - Mathf.Max(rt.sizeDelta.y, tmp.fontSize * 0.85f);
            if (bottom < lowestY) lowestY = bottom;
        }

        _panelRt.anchoredPosition = new Vector2(-12f, lowestY - 4f);
    }

    private void HidePanel()
    {
        if (_panelRoot != null)
        {
            _panelRoot.SetActive(false);
        }

        _lastText = string.Empty;
    }
}
