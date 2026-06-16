namespace ScannerAgent.Models;

public class ScannerStatus
{
    public bool IsOnline { get; set; } = true;
    public bool IsScannerConnected { get; set; }
    public int ActiveJobs { get; set; }
    public TimeSpan Uptime { get; set; }
    public string Version { get; set; } = "1.0.0";
    public DateTime? LastScanTime { get; set; }
}
