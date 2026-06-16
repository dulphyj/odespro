using ScannerAgent.Models;

namespace ScannerAgent.Services;

public interface IScannerProvider
{
    Task<List<ScannerInfo>> GetScannersAsync();
    Task<ScannerInfo?> GetDefaultScannerAsync();
    Task<bool> TestScannerAsync(string scannerId);
    Task<ScanResult> ScanAsync(ScanRequest request, CancellationToken ct = default);
    Task<ScanResult> ScanPreviewAsync(string scannerId, int dpi = 200);
}
