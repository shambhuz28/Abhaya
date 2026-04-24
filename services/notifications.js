import journeyAPI from './journey';
import vehicleObservationAPI from './vehicleObservations';

const EVENT_CONFIG = {
  journey_started: {
    title: 'Journey started',
    icon: 'navigate-circle-outline',
    tint: '#0f9d7a',
    background: '#e9fbf4',
  },
  journey_completed: {
    title: 'Journey completed',
    icon: 'checkmark-done-circle-outline',
    tint: '#0f9d7a',
    background: '#e9fbf4',
  },
  journey_ended: {
    title: 'Journey ended',
    icon: 'pause-circle-outline',
    tint: '#6b7280',
    background: '#f3f4f6',
  },
  crime_zone_alert: {
    title: 'Danger area entered',
    icon: 'warning-outline',
    tint: '#dc2626',
    background: '#fff1f1',
  },
  deviation_detected: {
    title: 'Route deviation detected',
    icon: 'git-compare-outline',
    tint: '#ea580c',
    background: '#fff7ed',
  },
  deviation_safety_prompt: {
    title: 'Safety alert shown',
    icon: 'shield-outline',
    tint: '#ea580c',
    background: '#fff7ed',
  },
  stationary_detected: {
    title: 'Stationary alert',
    icon: 'timer-outline',
    tint: '#ea580c',
    background: '#fff7ed',
  },
  stationary_safety_prompt: {
    title: 'No movement safety alert',
    icon: 'shield-outline',
    tint: '#ea580c',
    background: '#fff7ed',
  },
  route_selected: {
    title: 'Route selected',
    icon: 'map-outline',
    tint: '#2563eb',
    background: '#ebf3ff',
  },
  route_switched: {
    title: 'Route switched',
    icon: 'swap-horizontal-outline',
    tint: '#2563eb',
    background: '#ebf3ff',
  },
  safe_deviation_reason: {
    title: 'Safety response saved',
    icon: 'shield-checkmark-outline',
    tint: '#7b57d1',
    background: '#f3edff',
  },
  safety_confirmed: {
    title: 'Safety confirmed',
    icon: 'shield-checkmark-outline',
    tint: '#0f9d7a',
    background: '#e9fbf4',
  },
  sos_sent: {
    title: 'SOS sent',
    icon: 'alert-circle-outline',
    tint: '#dc2626',
    background: '#fff1f1',
  },
  vehicle_scan_saved: {
    title: 'Vehicle no plate scanned',
    icon: 'car-sport-outline',
    tint: '#7b57d1',
    background: '#f3edff',
  },
};

const formatEventNotification = (event, historyItem) => {
  const config = EVENT_CONFIG[event.type] || {
    title: 'Journey update',
    icon: 'notifications-outline',
    tint: '#7b57d1',
    background: '#f3edff',
  };

  return {
    id: `${historyItem.id}-${event.type}-${event.createdAt || historyItem.updatedAt}`,
    source: 'journey',
    type: event.type,
    title: config.title,
    message: event.message || 'Journey status updated.',
    createdAt:
      event.createdAt || historyItem.updatedAt || historyItem.createdAt || new Date().toISOString(),
    icon: config.icon,
    tint: config.tint,
    background: config.background,
  };
};

const formatVehicleNotification = (item) => ({
  id: `vehicle-${item.id}`,
  source: 'vehicle',
  type: 'vehicle_scan_saved',
  title: 'Vehicle no plate scanned',
  message: [
    item.plateNumber || 'Plate not detected',
    item.driverName || 'Driver not available',
    item.driverPhone || 'Phone not available',
  ].join(' | '),
  createdAt: item.createdAt || item.updatedAt || new Date().toISOString(),
  icon: 'car-sport-outline',
  tint: '#7b57d1',
  background: '#f3edff',
});

const notificationsAPI = {
  list: async () => {
    const [history, vehicleScans] = await Promise.all([
      journeyAPI.listHistory().catch(() => []),
      vehicleObservationAPI.list().catch(() => []),
    ]);

    const journeyNotifications = (Array.isArray(history) ? history : []).flatMap((item) =>
      (Array.isArray(item.events) ? item.events : []).map((event) =>
        formatEventNotification(event, item)
      )
    );

    const vehicleNotifications = (Array.isArray(vehicleScans) ? vehicleScans : []).map(
      formatVehicleNotification
    );

    return [...vehicleNotifications, ...journeyNotifications].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  },
};

export default notificationsAPI;
