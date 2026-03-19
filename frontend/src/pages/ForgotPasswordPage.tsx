import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { forgotPassword, confirmForgotPassword } from '../auth/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setCodeSent(true);
    } catch (err: any) {
      if (err.code === 'InvalidParameterException' && err.message?.includes('verified')) {
        navigate(`/verify?email=${encodeURIComponent(email)}&next=/forgot-password`);
        return;
      }
      setError(err.message ?? 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await confirmForgotPassword(email, code, newPassword);
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? 'Password reset failed');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="flex items-center gap-2.5 mb-6">
          <img src="/logo-solid.svg" alt="filterbrr" className="h-8 w-auto brightness-0 invert" />
          <span className="text-lg font-semibold tracking-tight text-foreground">filterbrr</span>
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Password reset</CardTitle>
            <CardDescription>Your password has been updated. You can now sign in.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/login')}>Go to login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (codeSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="flex items-center gap-2.5 mb-6">
          <img src="/logo-solid.svg" alt="filterbrr" className="h-8 w-auto brightness-0 invert" />
          <span className="text-lg font-semibold tracking-tight text-foreground">filterbrr</span>
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>We sent a reset code to {email}. Enter it below with your new password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="code">Reset code</Label>
                <Input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="newPassword">New password</Label>
                <Input id="newPassword" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Resetting...' : 'Reset password'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="underline">Back to login</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Forgot password</CardTitle>
          <CardDescription>Enter your email and we'll send you a reset code.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSendCode} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset code'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="underline">Back to login</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
