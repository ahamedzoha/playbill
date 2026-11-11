'use client';

export function SignOut() {
  return (
    <button
      type="button"
      className="underline-offset-4 hover:underline"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
      }}
    >
      Sign out
    </button>
  );
}
