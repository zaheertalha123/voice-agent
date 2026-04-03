/**
 * Client for POST /validate-secret on the webhook server.
 * The server compares the submitted value to `SETUP_SECRET` (see webhook-server).
 */

const WEBHOOK_SERVER_URL =
  import.meta.env.VITE_WEBHOOK_SERVER_URL || 'http://localhost:8080';

/**
 * Validate an admin setup secret via the server.
 * @param secret - The plaintext secret to validate
 * @returns true if valid, false otherwise
 */
export async function validateSetupSecret(secret: string): Promise<boolean> {
  try {
    const response = await fetch(`${WEBHOOK_SERVER_URL}/validate-secret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.valid === true;
  } catch (error) {
    console.error('Failed to validate secret:', error);
    return false;
  }
}
