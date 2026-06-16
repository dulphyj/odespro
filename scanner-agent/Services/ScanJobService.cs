using System.Collections.Concurrent;
using ScannerAgent.Models;

namespace ScannerAgent.Services;

public class ScanJobService
{
    private readonly ConcurrentDictionary<Guid, ScanJob> _jobs = new();
    private readonly ILogger<ScanJobService> _logger;

    public ScanJobService(ILogger<ScanJobService> logger)
    {
        _logger = logger;
    }

    public ScanJob CreateJob(ScanRequest request)
    {
        var jobId = Guid.NewGuid();
        var job = new ScanJob
        {
            Id = jobId,
            Request = request,
            Status = "Created",
            CreatedAt = DateTime.UtcNow,
            Result = new ScanResult
            {
                JobId = jobId,
                Status = "Created",
                CreatedAt = DateTime.UtcNow,
                FileFormat = request.FileFormat
            }
        };
        _jobs[job.Id] = job;
        _logger.LogInformation("Scan job {JobId} created", job.Id);
        return job;
    }

    public void UpdateJobStatus(Guid jobId, string status, List<ScanPage>? pages = null)
    {
        if (_jobs.TryGetValue(jobId, out var job))
        {
            job.Status = status;
            job.Result.Status = status;
            job.LastUpdatedAt = DateTime.UtcNow;

            if (pages != null)
            {
                job.Result.Pages = pages;
                job.Result.TotalPages = pages.Count;
            }

            if (status is "Completed" or "Failed" or "Cancelled")
            {
                job.CompletedAt = DateTime.UtcNow;
            }
        }
    }

    public void UpdateJobResult(Guid jobId, Action<ScanResult> update)
    {
        if (_jobs.TryGetValue(jobId, out var job))
        {
            update(job.Result);
            job.LastUpdatedAt = DateTime.UtcNow;
        }
    }

    public ScanJob? GetJob(Guid jobId)
    {
        _jobs.TryGetValue(jobId, out var job);
        return job;
    }

    public ScanResult? GetJobResult(Guid jobId)
    {
        return _jobs.TryGetValue(jobId, out var job) ? job.Result : null;
    }

    public int CleanupOldJobs(TimeSpan olderThan)
    {
        var cutoff = DateTime.UtcNow.Subtract(olderThan);
        var removed = 0;

        foreach (var kvp in _jobs)
        {
            if (kvp.Value.Status is "Completed" or "Failed" or "Cancelled" &&
                kvp.Value.CompletedAt.HasValue &&
                kvp.Value.CompletedAt.Value < cutoff)
            {
                if (_jobs.TryRemove(kvp.Key, out _))
                {
                    removed++;
                }
            }
        }

        if (removed > 0)
        {
            _logger.LogInformation("Cleaned up {Count} old scan jobs", removed);
        }

        return removed;
    }

    public int ActiveJobCount => _jobs.Values.Count(j => j.Status is "Created" or "Scanning" or "Processing");
}

public class ScanJob
{
    public Guid Id { get; set; }
    public ScanRequest Request { get; set; } = null!;
    public string Status { get; set; } = "Created";
    public DateTime CreatedAt { get; set; }
    public DateTime? LastUpdatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public CancellationTokenSource? CancellationTokenSource { get; set; }
    public ScanResult Result { get; set; } = null!;
}
