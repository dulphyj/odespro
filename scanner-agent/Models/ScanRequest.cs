namespace ScannerAgent.Models;

public class ScanRequest
{
    public string ScannerId { get; set; } = string.Empty;
    public int Dpi { get; set; } = 300;
    public string ColorMode { get; set; } = "Color";
    public bool Duplex { get; set; }
    public bool UseAdf { get; set; }
    public string PaperSize { get; set; } = "A4";
    public int PageCount { get; set; } = 1;
    public string FileFormat { get; set; } = "Pdf";
    public int CompressionLevel { get; set; } = 75;
}
