import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const getSafeText = (value, fallback = '-') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const formatTimestamp = (value) => {
  if (!value) return '-';

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return getSafeText(value);
    return date.toLocaleString();
  } catch {
    return getSafeText(value);
  }
};

const buildTimelineText = (timeline = []) => {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return 'No timeline available.';
  }

  return timeline.map((item, index) => `${index + 1}. ${getSafeText(item)}`).join('\n');
};

const buildEvidenceText = (evidence = []) => {
  const items = Array.isArray(evidence) ? evidence.filter((item) => item?.url) : [];
  if (!items.length) {
    return 'No evidence attached.';
  }

  return items
    .map((item, index) => {
      const label = getSafeText(item?.label || item?.type || `Evidence ${index + 1}`);
      const timestamp = formatTimestamp(item?.timestamp);
      const url = getSafeText(item?.url);
      return `${index + 1}. ${label}\n   Time: ${timestamp}\n   URL: ${url}`;
    })
    .join('\n\n');
};

export const buildIncidentReportText = (report) => {
  if (!report?.incidentId) {
    throw new Error('No incident report available to export.');
  }

  return [
    'ABHAYA INCIDENT REPORT',
    '',
    `Incident ID: ${getSafeText(report.incidentId)}`,
    `Created At: ${formatTimestamp(report.createdAt)}`,
    `Status: ${getSafeText(report.status, 'ACTIVE')}`,
    '',
    'USER',
    `Name: ${getSafeText(report.user?.name)}`,
    `Phone: ${getSafeText(report.user?.phone)}`,
    '',
    'TRIGGER',
    `Type: ${getSafeText(report.trigger?.type, 'SOS')}`,
    `Risk Score: ${getSafeText(report.trigger?.riskScore, 'HIGH')}`,
    '',
    'LOCATION',
    `Latitude: ${getSafeText(report.location?.lat)}`,
    `Longitude: ${getSafeText(report.location?.lng)}`,
    `Address: ${getSafeText(report.location?.address)}`,
    '',
    'TIMELINE',
    buildTimelineText(report.timeline),
    '',
    'EVIDENCE',
    buildEvidenceText(report.evidence),
    '',
    `Emergency Email Sent: ${report?.notification?.sent ? 'Yes' : 'No'}`,
  ].join('\n');
};

export const exportIncidentReport = async (report) => {
  const reportText = buildIncidentReportText(report);
  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;

  if (!baseDir) {
    throw new Error('File export is not available on this device.');
  }

  const safeIncidentId = getSafeText(report?.incidentId, 'report').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileUri = `${baseDir}abhaya-report-${safeIncidentId}.txt`;

  await FileSystem.writeAsStringAsync(fileUri, reportText);

  const sharePayload =
    Platform.OS === 'android'
      ? {
          title: 'ABHAYA Incident Report',
          message: `ABHAYA Incident Report\n${fileUri}`,
          url: fileUri,
        }
      : {
          title: 'ABHAYA Incident Report',
          message: 'ABHAYA Incident Report',
          url: fileUri,
        };

  await Share.share(sharePayload);

  return { success: true, fileUri };
};
