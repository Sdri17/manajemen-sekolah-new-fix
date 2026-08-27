/**
 * EduSync Notification & Service Worker Manager
 * Handles Service Worker registration and Web Notifications for Firestore updates.
 */

let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Register the Service Worker in supported browsers
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('[NotificationService] Service Worker not supported');
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    swRegistration = reg;
    console.log('[NotificationService] Service Worker registered with scope:', reg.scope);
    return reg;
  } catch (err) {
    console.warn('[NotificationService] Service Worker registration failed:', err);
    return null;
  }
}

/**
 * Check current Notification permission status
 */
export function getNotificationPermissionStatus(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Request permission from user for Web Notifications
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('[NotificationService] Notifications are not supported in this browser.');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    console.log('[NotificationService] Notification permission result:', permission);
    return permission === 'granted';
  } catch (err) {
    console.error('[NotificationService] Error requesting notification permission:', err);
    return false;
  }
}

/**
 * Trigger a push / local notification via Service Worker or fallback
 */
export async function sendLocalPushNotification(
  title: string,
  options?: {
    body?: string;
    tag?: string;
    icon?: string;
    url?: string;
    data?: any;
  }
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const notificationOptions = {
    body: options?.body || 'Pembaruan data baru di EduSync.',
    icon: options?.icon || '/icon.png',
    badge: '/pwa-192.png',
    tag: options?.tag || 'edusync-data-update',
    renotify: true,
    data: options?.url || '/',
    vibrate: [100, 50, 100]
  };

  try {
    // Try via Service Worker Registration first
    if (!swRegistration && 'serviceWorker' in navigator) {
      swRegistration = await navigator.serviceWorker.getRegistration();
    }

    if (swRegistration && 'showNotification' in swRegistration) {
      await swRegistration.showNotification(title, notificationOptions as any);
      return true;
    } else {
      // Fallback to standard Notification constructor
      new Notification(title, notificationOptions);
      return true;
    }
  } catch (err) {
    console.warn('[NotificationService] Failed to show notification:', err);
    return false;
  }
}
