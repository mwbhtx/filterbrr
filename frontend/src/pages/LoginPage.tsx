import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, loginAsDemo } from '../auth/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Activity, Filter, Zap } from 'lucide-react';

const FEATURES = [
  {
    icon: Filter,
    title: 'Smart Filter Builder',
    desc: 'Create and fine-tune autobrr filters with AI-assisted generation based on real torrent data.',
  },
  {
    icon: Activity,
    title: 'Simulation Engine',
    desc: 'Test your filters against scraped datasets before going live — see grabs, disk usage, and ratios.',
  },
  {
    icon: Zap,
    title: 'One-Click Sync',
    desc: 'Push filters directly to your autobrr instance. Pull existing ones in to iterate and improve.',
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      if (err.code === 'UserNotConfirmedException' || err.name === 'UserNotConfirmedException') {
        navigate(`/verify?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setError('');
    setDemoLoading(true);
    try {
      await loginAsDemo();
      navigate('/');
    } catch (err: any) {
      setError(err.message ?? 'Demo login failed');
      setDemoLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-background force-dark">
      {/* Left: Splash (desktop) */}
      <div className="hidden lg:flex flex-col justify-center items-end flex-1 pr-16 xl:pr-24 relative overflow-hidden">
        {/* Subtle radial glow */}
        <div className="pointer-events-none absolute -top-1/4 -left-1/4 w-[80%] h-[80%] rounded-full bg-primary/[0.03] blur-3xl" />

        <div className="relative z-10 max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <img
              src="/logo-solid.svg"
              alt="filterbrr"
              className="h-12 w-auto logo-themed"
            />
            <span className="text-2xl font-bold tracking-tight text-foreground">filterbrr</span>
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-foreground leading-[1.1] mb-4">
            Simulate before
            <br />
            you automate.
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed mb-12 max-w-md">
            Build, test, and deploy autobrr filters with confidence.
            See exactly what gets grabbed before flipping the switch.
          </p>

          <div className="space-y-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4 items-start">
                <div className="shrink-0 mt-0.5 flex items-center justify-center size-9 rounded-lg bg-muted/60 ring-1 ring-border">
                  <f.icon className="size-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{f.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile + Desktop Login */}
      <div className="flex flex-col items-center w-full lg:flex-1 lg:items-start lg:pl-16 xl:pl-24 lg:border-l lg:border-border lg:justify-center px-6 py-12 lg:py-0 overflow-y-auto">
        {/* Mobile hero — hidden on desktop */}
        <div className="text-center mb-8 lg:hidden">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <img
              src="/logo-solid.svg"
              alt="filterbrr"
              className="h-10 w-auto logo-themed"
            />
            <span className="text-xl font-bold tracking-tight text-foreground">filterbrr</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground leading-tight mb-2">
            Simulate before you automate.
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Build, test, and deploy autobrr filters with confidence.
          </p>
        </div>

        {/* Login card */}
        <Card className="w-full max-w-sm">
          {demoLoading ? (
            <CardContent className="py-12 flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <p className="text-sm text-muted-foreground">Initializing demo...</p>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Sign in</CardTitle>
                <CardDescription>Enter your credentials to continue</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type={import.meta.env.DEV ? 'text' : 'email'} value={email} onChange={e => setEmail(e.target.value)} required={!import.meta.env.DEV} data-lpignore="true" autoComplete="off" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required={!import.meta.env.DEV} data-lpignore="true" autoComplete="off" />
                    <div>
                      <Link to="/forgot-password" className="text-xs text-muted-foreground underline">Forgot password?</Link>
                    </div>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign in'}
                  </Button>
                </form>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
                </div>
                <Button className="w-full btn-glow" onClick={handleDemo} disabled={loading}>
                  Try Demo
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  No account? <Link to="/signup" className="underline">Sign up</Link>
                </p>
              </CardContent>
            </>
          )}
        </Card>

        {/* Mobile features — hidden on desktop */}
        <div className="mt-10 space-y-5 w-full max-w-sm lg:hidden">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3.5 items-start">
              <div className="shrink-0 mt-0.5 flex items-center justify-center size-8 rounded-lg bg-muted/60 ring-1 ring-border">
                <f.icon className="size-3.5 text-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{f.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
