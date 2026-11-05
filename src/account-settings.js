/**
 * UNICOSEC self-service account credentials.
 * Only the authenticated Supabase Auth identity is updated.
 * Do not create/delete auth.users or migrate any DMS portfolio records.
 */
const html = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function renderAccountSettings(email = '') {
  return `<section class="account-settings" aria-label="UNICOSEC account settings">
    <div class="content-header"><div><p class="eyebrow">PERSONAL ACCOUNT · SECURITY</p>
    <h1>Account Settings</h1><p class="muted">Update the email address or password used to sign in to UNICOSEC on the website, Windows and Android.</p></div></div>
    <div class="account-settings-grid">
      <section class="account-settings-panel" aria-labelledby="account-email-title">
        <h2 id="account-email-title">Change login email</h2>
        <p class="muted">Current email: <strong class="account-current-email">${html(email)}</strong></p>
        <p class="muted">Your existing company records, signing requests and drafts remain linked to this same account. You may need to confirm messages sent to both email addresses.</p>
        <form id="account-email-form">
          <label class="input-label">New email address<input name="newEmail" type="email" autocomplete="email" maxlength="254" placeholder="new@company.com" required></label>
          <label class="input-label">Confirm new email address<input name="confirmEmail" type="email" autocomplete="off" maxlength="254" required></label>
          <button type="submit" class="btn primary">Request email change</button>
        </form>
      </section>
      <section class="account-settings-panel" aria-labelledby="account-password-title">
        <h2 id="account-password-title">Change password</h2>
        <p class="muted">Enter your current password to verify your identity. Use a unique new password of at least 12 characters.</p>
        <form id="account-password-form">
          <label class="input-label">Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label>
          <label class="input-label">New password<input name="newPassword" type="password" autocomplete="new-password" minlength="12" required></label>
          <label class="input-label">Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required></label>
          <button type="submit" class="btn primary">Update password</button>
        </form>
      </section>
    </div>
    <p class="muted account-settings-help">For a forgotten password, use the account recovery process instead of making a new account. Never share your password or verification codes.</p>
  </section>`;
}

export async function requestAccountEmailChange(auth, {currentEmail, newEmail, confirmEmail}) {
  const next = String(newEmail ?? '').trim();
  const confirmed = String(confirmEmail ?? '').trim();
  if (!next || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
    throw new Error('Enter a valid new email address.');
  }
  if (next !== confirmed) throw new Error('The two new email addresses do not match.');
  if (next.toLowerCase() === String(currentEmail ?? '').trim().toLowerCase()) {
    throw new Error('The new email address is the same as your current email.');
  }
  const {error} = await auth.updateUser({email:next});
  if (error) throw error;
  return 'Email change requested. Check your old and new inboxes for any verification messages. Continue using the current email until the change is confirmed.';
}

export async function requestAccountPasswordChange(auth, {userId, email, currentPassword, newPassword, confirmPassword}) {
  const existing = String(currentPassword ?? '');
  const next = String(newPassword ?? '');
  if (!userId || !email) throw new Error('Your login session has expired. Sign in again.');
  if (!existing) throw new Error('Enter your current password.');
  if (next.length < 12) throw new Error('Use a new password of at least 12 characters.');
  if (next !== String(confirmPassword ?? '')) throw new Error('The new passwords do not match.');
  if (existing === next) throw new Error('Your new password must be different from your current password.');

  // Compatible with older supabase-js builds: explicitly verify the existing
  // password before calling updateUser; never send a service-role key to clients.
  const verified = await auth.signInWithPassword({email, password:existing});
  if (verified.error) throw new Error('Could not verify your current password. Check it and try again.');
  if (verified.data?.user?.id !== userId) throw new Error('Login account changed. Sign in again before updating your password.');

  const {error} = await auth.updateUser({password:next});
  if (error) throw error;
  return 'Password changed successfully. Use your new password the next time you sign in on any device.';
}
