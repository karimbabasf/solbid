// The command an outside agent runs to buy a seat. `npm run room` starts pay's gateway in sandbox mode.
export const enterCommand = (enterUrl: string) => `pay --sandbox curl -s -X POST ${enterUrl} -d '{"goal":"make me laugh"}'`;

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context and focus; fall back to a hidden textarea.
    try {
      const t = document.createElement('textarea');
      t.value = text;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
