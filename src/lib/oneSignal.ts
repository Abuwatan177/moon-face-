type OneSignalSdk = {
  init: (options: {
    appId: string;
    allowLocalhostAsSecureOrigin: boolean;
    autoResubscribe: boolean;
    serviceWorkerPath: string;
    serviceWorkerParam: { scope: string };
  }) => Promise<void>;
  Notifications: {
    permission: boolean;
    requestPermission: () => Promise<void>;
  };
  User: {
    PushSubscription: {
      id: string | null;
      optIn: () => Promise<void>;
    };
  };
};

declare global {
  interface Window {
    OneSignalDeferred?: ((sdk: OneSignalSdk) => void | Promise<void>)[];
  }
}

const appId = import.meta.env.VITE_ONESIGNAL_APP_ID?.trim();
let initialization: Promise<OneSignalSdk> | null = null;

export async function subscribeWithOneSignal() {
  if (!appId) throw new Error('OneSignal is not configured.');
  if (Notification.permission === 'denied') {
    throw new Error('إشعارات الموقع محظورة في المتصفح. اسمح بها من إعدادات الموقع ثم أعد المحاولة.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('لم يتم السماح بإشعارات الموقع.');

  if (!initialization) {
    initialization = new Promise((resolve, reject) => {
      const deferred = window.OneSignalDeferred ||= [];
      deferred.push(async (sdk) => {
        try {
          await sdk.init({
            appId,
            allowLocalhostAsSecureOrigin: import.meta.env.DEV,
            autoResubscribe: true,
            serviceWorkerPath: '/push/onesignal/OneSignalSDKWorker.js',
            serviceWorkerParam: { scope: '/push/onesignal/' },
          });
          resolve(sdk);
        } catch (error) {
          reject(error);
        }
      });

      const script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.async = true;
      script.onerror = () => {
        initialization = null;
        reject(new Error('Could not load the OneSignal SDK.'));
      };
      document.head.append(script);
    });
  }

  const oneSignal = await initialization;
  await oneSignal.User.PushSubscription.optIn();
  const subscriptionId = oneSignal.User.PushSubscription.id;
  if (!subscriptionId) throw new Error('OneSignal did not return a subscription ID.');
  return subscriptionId;
}