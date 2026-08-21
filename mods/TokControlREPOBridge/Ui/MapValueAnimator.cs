using UnityEngine;

namespace TokControlREPOBridge.Ui;

internal sealed class MapValueAnimator
{
    private const float ScanDuration = 0.85f;
    private const float LossFadeDuration = 1.75f;

    private float _mapValue;
    private float _lossAmount;
    private float _lossFadeTimer;
    private float _scanTimer;
    private float _scanMax;
    private bool _scanReady;

    internal bool IsScanReady => _scanReady;

    internal bool IsAnimating => _lossFadeTimer > 0f;

    internal void BeginLevel()
    {
        _mapValue = 0f;
        _lossAmount = 0f;
        _lossFadeTimer = 0f;
        _scanTimer = ScanDuration;
        _scanMax = 0f;
        _scanReady = false;
    }

    internal void EndLevel()
    {
        _scanReady = false;
        _scanTimer = 0f;
        _lossAmount = 0f;
        _lossFadeTimer = 0f;
    }

    internal void Tick(float actualValue, float deltaTime)
    {
        if (!_scanReady)
        {
            _scanMax = Mathf.Max(_scanMax, actualValue);
            _scanTimer -= deltaTime;
            if (_scanTimer <= 0f)
            {
                _mapValue = _scanMax;
                _scanReady = true;
            }

            return;
        }

        if (actualValue > _mapValue + 0.5f)
        {
            _mapValue = actualValue;
            return;
        }

        if (actualValue < _mapValue - 0.5f)
        {
            _lossAmount = _mapValue - actualValue;
            _mapValue = actualValue;
            _lossFadeTimer = LossFadeDuration;
        }
        else
        {
            _mapValue = actualValue;
        }

        if (_lossFadeTimer > 0f)
        {
            _lossFadeTimer -= deltaTime;
            if (_lossFadeTimer <= 0f)
            {
                _lossAmount = 0f;
                _lossFadeTimer = 0f;
            }
        }
    }

    internal string? BuildMapLine()
    {
        if (!_scanReady) return null;

        if (_lossAmount > 0.5f && _lossFadeTimer > 0f)
        {
            var alpha = Mathf.Clamp01(_lossFadeTimer / LossFadeDuration);
            var fade = Color32ToHex(255, (byte)Mathf.RoundToInt(77 * alpha), (byte)Mathf.RoundToInt(77 * alpha));
            return $"<color=#{fade}>-${_lossAmount:N0}</color> MAP: ${_mapValue:N0}";
        }

        return $"MAP: ${_mapValue:N0}";
    }

    private static string Color32ToHex(byte r, byte g, byte b)
    {
        return $"{r:X2}{g:X2}{b:X2}";
    }
}
