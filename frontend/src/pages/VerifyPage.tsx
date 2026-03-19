import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { confirmSignUp, resendConfirmationCode } from '../auth/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function VerifyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const next = searchParams.get('next');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmSignUp(email, code);
      setConfirmed(true);
    } catch (err: any) {
      setError(err.message ?? 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    try {
      await resendConfirmationCode(email);
      setResent(true);
    } catch (err: any) {
      setError(err.message ?? 'Failed to resend code');
    }
  }

  if (confirmed) {
    const redirectTo = next || '/login';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="flex items-center gap-2.5 mb-6">
          <img src="/logo-solid.svg" alt="filterbrr" className="h-8 w-auto brightness-0 invert" />
          <span className="text-lg font-semibold tracking-tight text-foreground">filterbrr</span>
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Account verified</CardTitle>
            <CardDescription>
              {next ? 'Your email is verified. Continuing...' : 'Your account is ready. You can now sign in.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate(redirectTo)}>
              {next ? 'Continue' : 'Go to login'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            {email
              ? <>We sent a verification code to {email}. Enter it below to activate your account.</>
              : <>Enter your email and the verification code we sent you.</>
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleConfirm} className="space-y-4">
            {!searchParams.get('email') && (
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="code">Verification code</Label>
              <Input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !email}>
              {loading ? 'Verifying...' : 'Verify'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Didn't get the code?{' '}
              <button type="button" onClick={handleResend} disabled={!email} className="underline">
                {resent ? 'Sent!' : 'Resend code'}
              </button>
            </p>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="underline">Back to login</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
