import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Chip,
  LinearProgress,
  Tab,
  Tabs,
  ImageList,
  ImageListItem,
  Modal,
  CircularProgress,
  Alert,
  Tooltip
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Image as ImageIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Mouse as ClickIcon,
  SwapVert as ScrollIcon,
  Keyboard as TypeIcon,
  ArrowBack as BackIcon,
  AccessTime as TimeIcon,
  Link as LinkIcon
} from '@mui/icons-material';
import axios from 'axios';

interface Report {
  id: string;
  sessionId: string;
  startUrl: string;
  startTime: string;
  endTime: string;
  totalSteps: number;
  uniqueUrlsVisited: number;
  duration: number;
  summary: {
    clickActions: number;
    scrollActions: number;
    typeActions: number;
    backActions: number;
    successRate: number;
  };
}

interface DetailedReport extends Report {
  steps: Array<{
    stepNumber: number;
    action: string;
    url: string;
    elementSelector?: string;
    elementText?: string;
    success: boolean;
    timestamp: string;
    screenshotPath?: string;
  }>;
}

interface ReportsModalProps {
  open: boolean;
  onClose: () => void;
}

const ReportsModal: React.FC<ReportsModalProps> = ({ open, onClose }) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<DetailedReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchReports();
    }
  }, [open]);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('http://localhost:15000/api/reports');
      if (response.data.success) {
        setReports(response.data.data.reports);
      }
    } catch (err) {
      setError('Failed to load reports');
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReportDetails = async (reportId: string) => {
    setLoading(true);
    try {
      const response = await axios.get(`http://localhost:15000/api/reports/${reportId}`);
      if (response.data.success) {
        setSelectedReport(response.data.data);
        setTabValue(1);
      }
    } catch (err) {
      setError('Failed to load report details');
      console.error('Error fetching report details:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteReport = async (reportId: string) => {
    if (!window.confirm('Are you sure you want to delete this report?')) return;

    try {
      const response = await axios.delete(`http://localhost:15000/api/reports/${reportId}`);
      if (response.data.success) {
        fetchReports();
        if (selectedReport?.id === reportId) {
          setSelectedReport(null);
          setTabValue(0);
        }
      }
    } catch (err) {
      setError('Failed to delete report');
      console.error('Error deleting report:', err);
    }
  };

  const exportReport = async (reportId: string, format: 'json' | 'html') => {
    try {
      const response = await axios.post(
        `http://localhost:15000/api/reports/export/${reportId}`,
        { format },
        {
          responseType: format === 'json' ? 'json' : 'text'
        }
      );

      // Create download
      const blob = new Blob(
        [format === 'json' ? JSON.stringify(response.data, null, 2) : response.data],
        { type: format === 'json' ? 'application/json' : 'text/html' }
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${reportId}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export report');
      console.error('Error exporting report:', err);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
      case 'click':
        return <ClickIcon fontSize="small" />;
      case 'scroll':
        return <ScrollIcon fontSize="small" />;
      case 'type':
        return <TypeIcon fontSize="small" />;
      case 'back':
        return <BackIcon fontSize="small" />;
      default:
        return null;
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getScreenshotUrl = (reportId: string, filename: string) => {
    const cleanFilename = filename.replace('screenshots/', '');
    return `http://localhost:15000/api/reports/${reportId}/screenshot/${cleanFilename}`;
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Exploration Reports</Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          <Tabs value={tabValue} onChange={(_: React.SyntheticEvent, v: number) => setTabValue(v)}>
            <Tab label="All Reports" />
            <Tab label="Report Details" disabled={!selectedReport} />
          </Tabs>

          {tabValue === 0 && (
            <Box sx={{ mt: 2 }}>
              {loading ? (
                <Box display="flex" justifyContent="center" p={3}>
                  <CircularProgress />
                </Box>
              ) : error ? (
                <Alert severity="error">{error}</Alert>
              ) : reports.length === 0 ? (
                <Alert severity="info">No reports available yet. Start an exploration to generate reports.</Alert>
              ) : (
                <Box display="flex" flexWrap="wrap" gap={2}>
                  {reports.map(report => (
                    <Box key={report.id} sx={{ flexBasis: { xs: '100%', md: 'calc(50% - 8px)' } }}>
                      <Card>
                        <CardContent>
                          <Typography variant="h6" gutterBottom noWrap>
                            {report.startUrl}
                          </Typography>

                          <Box display="flex" gap={1} mb={2}>
                            <Chip
                              icon={<TimeIcon />}
                              label={formatDuration(report.duration)}
                              size="small"
                              variant="outlined"
                            />
                            <Chip
                              icon={<LinkIcon />}
                              label={`${report.uniqueUrlsVisited} URLs`}
                              size="small"
                              variant="outlined"
                            />
                            <Chip
                              label={`${report.summary.successRate.toFixed(0)}% Success`}
                              size="small"
                              color={report.summary.successRate > 80 ? 'success' : 'warning'}
                            />
                          </Box>

                          <Typography variant="body2" color="textSecondary">
                            {new Date(report.startTime).toLocaleString()}
                          </Typography>

                          <Box display="flex" gap={1} mt={2}>
                            <Typography variant="caption">
                              <ClickIcon fontSize="small" /> {report.summary.clickActions}
                            </Typography>
                            <Typography variant="caption">
                              <ScrollIcon fontSize="small" /> {report.summary.scrollActions}
                            </Typography>
                            <Typography variant="caption">
                              <TypeIcon fontSize="small" /> {report.summary.typeActions}
                            </Typography>
                            <Typography variant="caption">
                              <BackIcon fontSize="small" /> {report.summary.backActions}
                            </Typography>
                          </Box>

                          <LinearProgress
                            variant="determinate"
                            value={report.summary.successRate}
                            sx={{ mt: 2 }}
                            color={report.summary.successRate > 80 ? 'success' : 'warning'}
                          />
                        </CardContent>

                        <CardActions>
                          <Button
                            size="small"
                            startIcon={<ViewIcon />}
                            onClick={() => fetchReportDetails(report.id)}
                          >
                            View
                          </Button>
                          <Button
                            size="small"
                            startIcon={<DownloadIcon />}
                            onClick={() => exportReport(report.id, 'html')}
                          >
                            Export
                          </Button>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => deleteReport(report.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </CardActions>
                      </Card>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {tabValue === 1 && selectedReport && (
            <Box sx={{ mt: 2 }}>
              <Box mb={2}>
                <Button onClick={() => setTabValue(0)} startIcon={<BackIcon />}>
                  Back to Reports
                </Button>
              </Box>

              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Report Summary
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={2}>
                    <Box flex={1} minWidth={120}>
                      <Typography variant="body2" color="textSecondary">Start URL</Typography>
                      <Typography variant="body1">{selectedReport.startUrl}</Typography>
                    </Box>
                    <Box flex={1} minWidth={120}>
                      <Typography variant="body2" color="textSecondary">Total Steps</Typography>
                      <Typography variant="body1">{selectedReport.totalSteps}</Typography>
                    </Box>
                    <Box flex={1} minWidth={120}>
                      <Typography variant="body2" color="textSecondary">Unique URLs</Typography>
                      <Typography variant="body1">{selectedReport.uniqueUrlsVisited}</Typography>
                    </Box>
                    <Box flex={1} minWidth={120}>
                      <Typography variant="body2" color="textSecondary">Success Rate</Typography>
                      <Typography variant="body1">{selectedReport.summary.successRate.toFixed(1)}%</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              <Typography variant="h6" gutterBottom>
                Exploration Steps
              </Typography>

              {selectedReport.steps.map((step) => (
                <Card key={step.stepNumber} sx={{ mb: 1 }}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box display="flex" alignItems="center" gap={1}>
                        {getActionIcon(step.action)}
                        <Typography variant="subtitle1">
                          Step {step.stepNumber}: {step.action}
                        </Typography>
                        {step.success ? (
                          <SuccessIcon color="success" fontSize="small" />
                        ) : (
                          <ErrorIcon color="error" fontSize="small" />
                        )}
                      </Box>
                      {step.screenshotPath && (
                        <Tooltip title="View Screenshot">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setScreenshotLoading(`${step.stepNumber}`);
                              setSelectedScreenshot(
                                getScreenshotUrl(selectedReport.id, step.screenshotPath!)
                              );
                            }}
                          >
                            <ImageIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>

                    <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                      URL: {step.url}
                    </Typography>

                    {step.elementSelector && (
                      <Typography variant="body2" color="textSecondary">
                        Selector: {step.elementSelector}
                      </Typography>
                    )}

                    {step.elementText && (
                      <Typography variant="body2" color="textSecondary">
                        Text: {step.elementText}
                      </Typography>
                    )}

                    <Typography variant="caption" color="textSecondary">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Screenshot Viewer Modal */}
      <Modal
        open={!!selectedScreenshot}
        onClose={() => {
          setSelectedScreenshot(null);
          setScreenshotLoading(null);
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Box
          sx={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            bgcolor: 'background.paper',
            boxShadow: 24,
            p: 2,
            borderRadius: 2,
            position: 'relative'
          }}
        >
          <IconButton
            onClick={() => {
              setSelectedScreenshot(null);
              setScreenshotLoading(null);
            }}
            sx={{ position: 'absolute', right: 8, top: 8, zIndex: 1 }}
          >
            <CloseIcon />
          </IconButton>

          {screenshotLoading && (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
              <CircularProgress />
            </Box>
          )}

          <img
            src={selectedScreenshot || ''}
            alt="Screenshot"
            style={{
              maxWidth: '100%',
              maxHeight: '80vh',
              display: screenshotLoading ? 'none' : 'block'
            }}
            onLoad={() => setScreenshotLoading(null)}
            onError={() => {
              setScreenshotLoading(null);
              setError('Failed to load screenshot');
            }}
          />
        </Box>
      </Modal>
    </>
  );
};

export default ReportsModal;