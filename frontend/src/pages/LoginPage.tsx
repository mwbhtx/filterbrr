import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, loginAsDemo } from '../auth/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Activity, Filter, Zap } from 'lucide-react';

// ── Network mesh background ──

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number; // 0 = purple, 1 = pink
  pulse: number;
  pulseSpeed: number;
}

interface Packet {
  fromIdx: number;
  toIdx: number;
  progress: number;
  speed: number;
  matched: boolean; // true = purple/pink glow, false = fades out
}

function NetworkMesh() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const packetsRef = useRef<Packet[]>([]);
  const animRef = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  const NODE_COUNT = 35;
  const CONNECTION_DIST = 180;
  const PACKET_SPAWN_RATE = 0.02;

  const init = useCallback((w: number, h: number) => {
    const nodes: Node[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: 1.5 + Math.random() * 2,
        hue: Math.random(),
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.01 + Math.random() * 0.02,
      });
    }
    nodesRef.current = nodes;
    packetsRef.current = [];
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      sizeRef.current = { w: rect.width, h: rect.height };
      if (nodesRef.current.length === 0) init(rect.width, rect.height);
    };

    resize();
    window.addEventListener('resize', resize);

    const purple = [124, 58, 237]; // #7c3aed
    const pink = [219, 39, 119];   // #db2777

    const lerp = (a: number[], b: number[], t: number) =>
      a.map((v, i) => Math.round(v + (b[i] - v) * t));

    const draw = () => {
      const { w, h } = sizeRef.current;
      ctx.clearRect(0, 0, w, h);

      const nodes = nodesRef.current;
      const packets = packetsRef.current;

      // Update nodes
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        n.pulse += n.pulseSpeed;

        // Bounce off edges with padding
        if (n.x < -20) n.vx = Math.abs(n.vx);
        if (n.x > w + 20) n.vx = -Math.abs(n.vx);
        if (n.y < -20) n.vy = Math.abs(n.vy);
        if (n.y > h + 20) n.vy = -Math.abs(n.vy);
      }

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            const opacity = (1 - dist / CONNECTION_DIST) * 0.08;
            const col = lerp(purple, pink, (nodes[i].hue + nodes[j].hue) / 2);
            ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${opacity})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        const pulseAlpha = 0.15 + Math.sin(n.pulse) * 0.1;
        const col = lerp(purple, pink, n.hue);
        // Outer glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${pulseAlpha * 0.3})`;
        ctx.fill();
        // Core
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${pulseAlpha + 0.2})`;
        ctx.fill();
      }

      // Spawn packets
      if (Math.random() < PACKET_SPAWN_RATE && nodes.length > 1) {
        const fromIdx = Math.floor(Math.random() * nodes.length);
        // Find a nearby node
        let toIdx = -1;
        let bestDist = Infinity;
        for (let j = 0; j < nodes.length; j++) {
          if (j === fromIdx) continue;
          const dx = nodes[fromIdx].x - nodes[j].x;
          const dy = nodes[fromIdx].y - nodes[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < CONNECTION_DIST && d < bestDist) {
            bestDist = d;
            toIdx = j;
          }
        }
        if (toIdx >= 0) {
          packets.push({
            fromIdx,
            toIdx,
            progress: 0,
            speed: 0.008 + Math.random() * 0.012,
            matched: Math.random() > 0.3, // 70% match rate
          });
        }
      }

      // Update and draw packets
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        p.progress += p.speed;
        if (p.progress >= 1) {
          // Flash the target node on match
          if (p.matched) {
            nodes[p.toIdx].pulse = 0; // reset pulse for a bright flash
          }
          packets.splice(i, 1);
          continue;
        }

        const from = nodes[p.fromIdx];
        const to = nodes[p.toIdx];
        const px = from.x + (to.x - from.x) * p.progress;
        const py = from.y + (to.y - from.y) * p.progress;

        const col = p.matched ? lerp(purple, pink, 0.5) : [100, 100, 100];
        const alpha = p.matched
          ? 0.6 * Math.sin(p.progress * Math.PI)
          : 0.2 * Math.sin(p.progress * Math.PI);

        // Packet glow
        ctx.beginPath();
        ctx.arc(px, py, p.matched ? 4 : 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`;
        ctx.fill();

        if (p.matched) {
          ctx.beginPath();
          ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha * 0.3})`;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [init]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
    />
  );
}

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
    <div className="min-h-screen flex bg-background force-dark relative overflow-hidden">
      {/* Network mesh background — full page */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <NetworkMesh />
      </div>

      {/* Left: Splash (desktop) */}
      <div className="hidden lg:flex flex-col justify-center items-end flex-1 pr-16 xl:pr-24 relative z-10">

        <div className="max-w-lg">
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
      <div className="flex flex-col items-center w-full lg:flex-1 lg:items-start lg:pl-16 xl:pl-24 relative z-10 lg:justify-center px-6 py-12 lg:py-0 overflow-y-auto">
        {/* Gradient divider line with glow */}
        <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-purple-500/50 to-transparent" />
        <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-[3px] -left-px blur-sm bg-gradient-to-b from-transparent via-pink-500/20 to-transparent" />
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
        <div className="relative w-full max-w-sm">
          {/* Glow border */}
          <div className="absolute -inset-px rounded-xl bg-gradient-to-b from-purple-500/40 via-pink-500/20 to-purple-500/40 blur-[2px]" />
          <div className="absolute -inset-px rounded-xl bg-gradient-to-b from-purple-500/30 via-pink-500/15 to-purple-500/30" />
        <Card className="relative bg-background border-0">
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
                    <div className="relative h-8 overflow-hidden">
                      <Input id="email" type={import.meta.env.DEV ? 'text' : 'email'} value={email} onChange={e => setEmail(e.target.value)} required={!import.meta.env.DEV} data-lpignore="false" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative h-8 overflow-hidden">
                      <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required={!import.meta.env.DEV} data-lpignore="false" />
                    </div>
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
        </div>

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
