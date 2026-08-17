/**
 * The sign-in email carries both routes in: a link to click on this device, and a
 * code to type on another one. Styling is inlined and table-free — Gmail strips
 * <style> blocks, so anything not inline simply would not arrive.
 */
function buildHtml(link: string, code: string | null): string {
  const codeBlock = code
    ? `<p style="margin:0 0 8px;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#5a6068">
         Signing in on another device? Enter this code instead:
       </p>
       <p style="margin:0 0 24px;font:600 32px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:6px;color:#16181d">
         ${code}
       </p>`
    : '';

  return `<div style="max-width:480px;margin:0 auto;padding:32px 24px;background:#fafaf8">
    <h1 style="margin:0 0 16px;font:600 20px/1.3 Georgia,'Times New Roman',serif;color:#16181d">Sign in to NCC Bot</h1>
    <p style="margin:0 0 24px;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#5a6068">
      This link works once and expires in 15 minutes.
    </p>
    <p style="margin:0 0 28px">
      <a href="${link}" style="display:inline-block;padding:12px 20px;background:#0b5fb0;color:#fff;text-decoration:none;border-radius:6px;font:500 15px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
        Sign in
      </a>
    </p>
    ${codeBlock}
    <p style="margin:0;font:13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#8a9099">
      If you didn't ask to sign in, you can ignore this email.
    </p>
  </div>`;
}

export async function sendMagicLinkEmail(
  apiKey: string,
  from: string,
  to: string,
  link: string,
  code: string | null = null,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: code ? `Your NCC Bot sign-in code: ${code}` : 'Sign in to NCC Bot',
      html: buildHtml(link, code),
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
  }
}
