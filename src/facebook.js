/**
 * Facebook JS SDK loader and login. The SDK is only downloaded when the server reports a
 * configured FACEBOOK_APP_ID and the player chooses to sign in with Facebook.
 */
let sdkPromise = null;

function loadSdk(appId) {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId, cookie: false, xfbml: false, version: 'v19.0' });
      resolve(window.FB);
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Could not load the Facebook SDK.'));
    };
    document.head.append(script);
  });
  return sdkPromise;
}

/** Opens the Facebook login dialog; resolves with a user access token. */
export async function facebookLogin(appId) {
  const FB = await loadSdk(appId);
  return new Promise((resolve, reject) => {
    FB.login(
      (response) => {
        const token = response?.authResponse?.accessToken;
        if (token) resolve(token);
        else reject(new Error('cancelled'));
      },
      { scope: 'public_profile' },
    );
  });
}
