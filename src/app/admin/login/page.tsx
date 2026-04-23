import { signIn } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-[#e8eaf0] mb-1">Small Council</h1>
        <p className="text-sm text-neutral-500 mb-6">Commissioner access only</p>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-800 text-red-400 text-sm">
            {decodeURIComponent(error)}
          </div>
        )}

        <form action={signIn} className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-[#e8eaf0] text-sm focus:outline-none focus:border-[#00E5FF]"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-[#e8eaf0] text-sm focus:outline-none focus:border-[#00E5FF]"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[#00E5FF] text-[#0a0c10] font-semibold rounded py-2 text-sm hover:opacity-90 transition-opacity"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
