export async function sendMagicLinkEmail(
  apiKey: string,
  from: string,
  to: string,
  link: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: 'Sign in to NCC Bot',
      html: `<p>Click below to sign in. This link expires in 15 minutes.</p><p><a href="${link}">${link}</a></p>`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
  }
}
