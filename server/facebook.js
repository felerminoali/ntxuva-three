/**
 * Facebook Login verification. The browser obtains a user access token with the Facebook
 * JS SDK; the server checks that the token was issued for this app and reads the profile.
 */
const GRAPH = 'https://graph.facebook.com/v19.0';

export async function verifyFacebookToken(accessToken, { appId, appSecret }, fetchImpl = fetch) {
  if (!appId) throw Object.assign(new Error('Facebook login is not configured on this server.'), { code: 'fb-disabled' });
  if (typeof accessToken !== 'string' || accessToken.length < 10) {
    throw Object.assign(new Error('Missing Facebook access token.'), { code: 'fb-invalid' });
  }
  const get = async (url) => {
    const res = await fetchImpl(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      throw Object.assign(new Error(body.error?.message || 'Facebook rejected the token.'), { code: 'fb-invalid' });
    }
    return body;
  };
  const token = encodeURIComponent(accessToken);
  if (appSecret) {
    const appToken = encodeURIComponent(`${appId}|${appSecret}`);
    const { data } = await get(`${GRAPH}/debug_token?input_token=${token}&access_token=${appToken}`);
    if (!data?.is_valid || String(data.app_id) !== String(appId)) {
      throw Object.assign(new Error('This Facebook token belongs to another app.'), { code: 'fb-invalid' });
    }
  } else {
    // Without the app secret we can still confirm which app the token was issued to.
    const app = await get(`${GRAPH}/app?access_token=${token}`);
    if (String(app.id) !== String(appId)) {
      throw Object.assign(new Error('This Facebook token belongs to another app.'), { code: 'fb-invalid' });
    }
  }
  const me = await get(`${GRAPH}/me?fields=id,name,picture.type(large)&access_token=${token}`);
  return { fbId: String(me.id), name: me.name || 'Facebook player', avatar: me.picture?.data?.url ?? null };
}
