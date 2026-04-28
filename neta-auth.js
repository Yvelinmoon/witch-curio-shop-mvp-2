(function () {
  const CONFIG = window.NETA_CONFIG;
  const STORAGE_KEY = "ta_session";
  const AUTH_RETURN_TO_KEY = "ta_auth_return_to";

  function b64url(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function randomBytes(size) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return b64url(bytes);
  }

  async function pkceChallenge(verifier) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return b64url(hash);
  }

  function decodeBase64Url(input) {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return atob(padded);
  }

  function parseJwtPayload(token) {
    const payload = token.split(".")[1];
    const binary = decodeBase64Url(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function clearAuthTemp() {
    sessionStorage.removeItem("pkce_verifier");
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("oauth_nonce");
  }

  function getStoredSession() {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const auth = {
    async signIn() {
      clearAuthTemp();

      const verifier = randomBytes(64);
      const state = randomBytes(16);
      const nonce = randomBytes(32);

      sessionStorage.setItem("pkce_verifier", verifier);
      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("oauth_nonce", nonce);
      sessionStorage.setItem(
        AUTH_RETURN_TO_KEY,
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );

      const challenge = await pkceChallenge(verifier);
      const params = new URLSearchParams({
        client_id: CONFIG.clientId,
        redirect_uri: CONFIG.redirectUri,
        response_type: "code",
        scope: CONFIG.scopes,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        nonce,
        resource: CONFIG.apiResource,
      });

      window.location.href = `${CONFIG.openPlatformEndpoint}/oidc/auth?${params.toString()}`;
    },

    async handleCallback(url) {
      const currentUrl = new URL(url);
      const code = currentUrl.searchParams.get("code");
      const state = currentUrl.searchParams.get("state");
      const error = currentUrl.searchParams.get("error");

      if (error) {
        clearAuthTemp();
        throw new Error(`OAuth error: ${error}`);
      }
      if (!code) {
        clearAuthTemp();
        throw new Error("Missing authorization code");
      }
      if (state !== sessionStorage.getItem("oauth_state")) {
        clearAuthTemp();
        throw new Error("Invalid OAuth state");
      }

      try {
        const response = await fetch(`${CONFIG.openPlatformEndpoint}/oidc/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: CONFIG.clientId,
            redirect_uri: CONFIG.redirectUri,
            code,
            code_verifier: sessionStorage.getItem("pkce_verifier"),
            resource: CONFIG.apiResource,
          }),
        });

        if (!response.ok) {
          throw new Error(`Token exchange failed: ${await response.text()}`);
        }

        const payload = await response.json();
        if (payload.id_token) {
          const idTokenPayload = parseJwtPayload(payload.id_token);
          const expectedNonce = sessionStorage.getItem("oauth_nonce");
          if (idTokenPayload.nonce !== expectedNonce) {
            throw new Error("Invalid nonce in id_token");
          }
        }

        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            accessToken: payload.access_token,
            refreshToken: payload.refresh_token,
            idToken: payload.id_token,
            expiresAt: Date.now() + payload.expires_in * 1000,
          }),
        );
      } finally {
        clearAuthTemp();
      }
    },

    async refreshAccessToken() {
      const session = getStoredSession();
      if (!session?.refreshToken) {
        this.signOutLocal();
        throw new Error("No refresh token available");
      }

      const response = await fetch(`${CONFIG.openPlatformEndpoint}/oidc/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: session.refreshToken,
          client_id: CONFIG.clientId,
          resource: CONFIG.apiResource,
        }),
      });

      if (!response.ok) {
        this.signOutLocal();
        throw new Error(`Token refresh failed: ${await response.text()}`);
      }

      const payload = await response.json();
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token || session.refreshToken,
          idToken: payload.id_token || session.idToken,
          expiresAt: Date.now() + payload.expires_in * 1000,
        }),
      );
    },

    async isAuthenticated() {
      const session = getStoredSession();
      return Boolean(session?.accessToken && session.expiresAt > Date.now());
    },

    async getAccessToken() {
      const session = getStoredSession();
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }
      if (session.expiresAt - Date.now() < 60_000) {
        await this.refreshAccessToken();
        return this.getAccessToken();
      }
      return session.accessToken;
    },

    getSession() {
      return getStoredSession();
    },

    signOutLocal() {
      sessionStorage.removeItem(STORAGE_KEY);
      clearAuthTemp();
    },

    async signOut() {
      this.signOutLocal();
      window.location.reload();
    },

    async boot() {
      const params = new URLSearchParams(window.location.search);
      if (params.has("code") || params.has("error")) {
        const returnTo = sessionStorage.getItem(AUTH_RETURN_TO_KEY) || window.location.pathname;
        await this.handleCallback(window.location.href);
        sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
        window.history.replaceState({}, "", returnTo);
      }
      return this.isAuthenticated();
    },
  };

  window.NetaAuth = auth;
})();
