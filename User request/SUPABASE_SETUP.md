# Trypo Supabase setup

## 1. Connect the app

Copy `.env.example` to `.env.local`, then use values from Supabase Dashboard **Connect**:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Do not put a secret key or `service_role` key in this frontend.

## 2. Apply the backend

This project uses npm and the Supabase CLI through `npx` only.

```powershell
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

The migration in `supabase/migrations/` creates profiles, trips, destinations,
itinerary items, bookings, expenses, saved data, collaboration/social data,
notifications, private storage, indexes, and RLS policies.

For local validation, start Docker and run:

```powershell
npx supabase start
npx supabase db reset
npx supabase db lint --local
```

## 3. Configure Auth in the Dashboard

Enable Email/Password authentication and add your deployed URL plus local preview
URL(s) to **Authentication → URL Configuration**. Turn on email confirmations for
production and configure an SMTP provider before launch.

### Password reset

The app uses Supabase Auth's `resetPasswordForEmail` flow. Add every URL where
the app can open to **Redirect URLs**, including:

```text
http://localhost:8443
http://127.0.0.1:8443
https://your-production-domain.example
```

Supabase sends the reset email and opens the app in recovery mode so the user can
set a new password. Configure an SMTP provider before production; otherwise
emails may be limited by Supabase's development email service.

### Google and Apple sign-in

Enable **Google** and **Apple** under **Authentication → Providers** and enter
the provider credentials there. The frontend only uses the public Supabase
publishable key; OAuth secrets stay in Supabase.

For both providers, use this callback URL in their developer consoles:

```text
https://<your-project-ref>.supabase.co/auth/v1/callback
```

For Google, create a Web OAuth client and add the callback URL to Authorized
redirect URIs. For Apple, create a Services ID, configure Sign in with Apple,
and use the same Supabase callback URL. The app sends users back to the current
origin after authentication.

## 4. Storage paths

Use the private `trypo-private` bucket with paths beginning with the authenticated
user ID, for example: `<user-id>/avatars/profile.jpg` or
`<user-id>/bookings/booking.pdf`. The policy intentionally prevents one user from
reading or writing another user's prefix.
