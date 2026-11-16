import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { migrateAnonymousData, hasAnonymousData } from '@/lib/anonymousSession';

export default function SaveProgressModal({ open, onOpenChange, triggerType, onComplete }) {
  const { isAuthenticated } = useAuth();
  const [step, setStep] = useState('prompt'); // prompt, register, login, verify, success
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // If already authenticated, don't show the modal
  if (isAuthenticated && open) {
    onOpenChange?.(false);
    return null;
  }

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await base44.auth.register({ email, password });
      setStep('verify');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await base44.auth.loginViaEmailPassword(email, password);
      window.location.href = '/galileo';
    } catch (err) {
      setError(err.message || 'Login failed');
      setLoading(false);
    }
  };

  const handleVerify = async (otpCode) => {
    setError('');
    setLoading(true);

    try {
      // Step 1: Verify OTP and set token
      const result = await base44.auth.verifyOtp({ email, otpCode });
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
      }

      // Step 2: Update user profile with optional name fields
      if (firstName || lastName) {
        await base44.auth.updateMe({
          first_name: firstName || null,
          last_name: lastName || null,
        });
      }

      // Step 3: Migrate anonymous data before redirecting
      if (hasAnonymousData()) {
        try {
          const migrated = await migrateAnonymousData();
          console.log('[SaveProgressModal] Migration complete:', {
            assessments: migrated.assessments,
            documents: migrated.documents,
            errors: migrated.errors,
          });
          if (migrated.errors?.length > 0) {
            console.warn('[SaveProgressModal] Migration had errors (non-fatal):', migrated.errors);
          }
        } catch (migrateErr) {
          // Non-fatal — log but do not block registration
          console.warn('[SaveProgressModal] Migration failed (non-fatal):', migrateErr?.message || migrateErr);
        }
      } else {
        console.log('[SaveProgressModal] No anonymous data to migrate.');
      }

      // Step 4: Show success, then redirect
      setStep('success');
      setTimeout(() => {
        navigate('/galileo');
        onComplete?.();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (triggerType) {
      case 'assessment':
        return 'Save Your Progress';
      case 'document':
        return 'Save Your Documents';
      case 'dashboard':
        return 'Save Your Dashboard';
      default:
        return 'Save Your Progress';
    }
  };

  const getDescription = () => {
    switch (triggerType) {
      case 'assessment':
        return 'Create an account so we can save your assessments, recommendations, and dashboard.';
      case 'document':
        return 'Create an account to securely store your documents and unlock full analysis.';
      case 'dashboard':
        return 'Create an account to save and track your business intelligence over time.';
      default:
        return 'Create an account to save your progress and access your dashboard anytime.';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-display font-bold">{getTitle()}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-2">
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        {step === 'prompt' && (
          <div className="space-y-3 py-4">
            <Button
              className="w-full h-12"
              onClick={() => setStep('register')}
            >
              Create Account
            </Button>
            <Button
              variant="outline"
              className="w-full h-12"
              onClick={() => setStep('login')}
            >
              Log In to Existing Account
            </Button>
            <Button
              variant="ghost"
              className="w-full h-10 text-muted-foreground text-sm"
              onClick={() => {
                onOpenChange?.(false);
                onComplete?.();
              }}
            >
              Continue Without Saving
            </Button>
          </div>
        )}

        {step === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4 py-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name (Optional)</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name (Optional)</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-10"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10"
                required
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-10"
                onClick={() => setStep('prompt')}
              >
                Back
              </Button>
              <Button type="submit" className="flex-1 h-10" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </div>
          </form>
        )}

        {step === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4 py-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="loginEmail">Email</Label>
              <Input
                id="loginEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-10"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loginPassword">Password</Label>
              <Input
                id="loginPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10"
                required
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-10"
                onClick={() => { setStep('prompt'); setError(''); }}
              >
                Back
              </Button>
              <Button type="submit" className="flex-1 h-10" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  'Log In'
                )}
              </Button>
            </div>
          </form>
        )}

        {step === 'verify' && (
          <div className="space-y-4 py-4">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                We sent a verification code to <strong>{email}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Enter the 6-digit code to complete your registration
              </p>
            </div>

            <div className="flex justify-center">
              <input
                type="text"
                maxLength={6}
                pattern="[0-9]{6}"
                inputMode="numeric"
                className="w-48 h-12 text-center text-2xl tracking-widest border border-input rounded-lg bg-background outline-none focus:border-primary"
                placeholder="000000"
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  if (value.length === 6) {
                    handleVerify(value);
                  }
                }}
                autoFocus
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm text-center">
                {error}
              </div>
            )}

            <Button
              variant="outline"
              className="w-full h-10"
              onClick={() => setStep('register')}
            >
              Back
            </Button>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <p className="text-lg font-semibold">Account Created!</p>
              <p className="text-sm text-muted-foreground">
                Redirecting to your dashboard...
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}