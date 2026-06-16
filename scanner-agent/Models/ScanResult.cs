namespace ScannerAgent.Models;

using System.Text.Json.Serialization;

public class ScanResult
{
    public Guid JobId { get; set; }
    public string Status { get; set; } = "Pending";
    public List<ScanPage> Pages { get; set; } = new();
    public int TotalPages { get; set; }
    public string FileFormat { get; set; } = "Pdf";
    public long FileSize { get; set; }
    public string? PdfPath { get; set; }
    public List<string> ImagePaths { get; set; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<string> Errors { get; set; } = new();
    [JsonPropertyName("backend_document_id")]
    public string? BackendDocumentId { get; set; }
}

public class ScanPage
{
    public int PageNumber { get; set; }
    public string ImagePath { get; set; } = string.Empty;
    public string? ThumbnailPath { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public double Rotation { get; set; }
    public bool HasOcr { get; set; }
    public string? OcrText { get; set; }
}
