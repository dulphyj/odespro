using System.Collections.Concurrent;
using ScannerAgent.Models;

namespace ScannerAgent.Services;

public class ScannerDiscoveryService : IDisposable
{
    private readonly IScannerProvider _provider;
    private readonly ILogger<ScannerDiscoveryService> _logger;
    private readonly ConcurrentDictionary<string, ScannerInfo> _cachedScanners = new();
    private Timer? _refreshTimer;
    private DateTime _lastRefresh = DateTime.MinValue;
    private readonly TimeSpan _refreshInterval = TimeSpan.FromSeconds(30);

    public event EventHandler<List<ScannerInfo>>? ScannersChanged;

    public IReadOnlyCollection<ScannerInfo> CachedScanners =>
        _cachedScanners.Values.ToList().AsReadOnly();

    public ScannerDiscoveryService(IScannerProvider provider, ILogger<ScannerDiscoveryService> logger)
    {
        _provider = provider;
        _logger = logger;
    }

    public void StartBackgroundRefresh()
    {
        _refreshTimer = new Timer(async _ => await RefreshScannersAsync(),
            null, TimeSpan.Zero, _refreshInterval);
        _logger.LogInformation("Scanner discovery background refresh started (interval: {Interval}s)",
            _refreshInterval.TotalSeconds);
    }

    public void StopBackgroundRefresh()
    {
        _refreshTimer?.Change(Timeout.Infinite, Timeout.Infinite);
        _logger.LogInformation("Scanner discovery background refresh stopped");
    }

    public async Task<List<ScannerInfo>> DiscoverScannersAsync()
    {
        try
        {
            var scanners = await _provider.GetScannersAsync();

            var previousIds = new HashSet<string>(_cachedScanners.Keys);
            var newIds = new HashSet<string>(scanners.Select(s => s.Id));

            _cachedScanners.Clear();
            foreach (var scanner in scanners)
            {
                _cachedScanners[scanner.Id] = scanner;
            }

            _lastRefresh = DateTime.UtcNow;

            if (!previousIds.SetEquals(newIds))
            {
                ScannersChanged?.Invoke(this, scanners);
            }

            _logger.LogDebug("Discovered {Count} scanners", scanners.Count);
            return scanners;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to discover scanners");
            return CachedScanners.ToList();
        }
    }

    public async Task<ScannerInfo?> GetDefaultScannerAsync()
    {
        var cached = _cachedScanners.Values.FirstOrDefault(s => s.IsDefault)
                     ?? _cachedScanners.Values.FirstOrDefault();

        if (cached != null) return cached;

        try
        {
            return await _provider.GetDefaultScannerAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get default scanner");
            return null;
        }
    }

    public async Task<bool> TestScannerAsync(string scannerId)
    {
        try
        {
            return await _provider.TestScannerAsync(scannerId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to test scanner {ScannerId}", scannerId);
            return false;
        }
    }

    public ScannerInfo? GetCachedScanner(string scannerId)
    {
        _cachedScanners.TryGetValue(scannerId, out var scanner);
        return scanner;
    }

    public DateTime GetLastRefreshTime() => _lastRefresh;

    private async Task RefreshScannersAsync()
    {
        try
        {
            await DiscoverScannersAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Background scanner refresh failed");
        }
    }

    public void Dispose()
    {
        _refreshTimer?.Dispose();
    }
}
