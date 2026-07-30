import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Shirt,
  Users,
} from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { DEMO_ENABLED, ROUTES } from "@/shared/constants";

export default function DemoPage() {
  const navigate = useNavigate();

  if (!DEMO_ENABLED) {
    return <Navigate to={ROUTES.SIGNIN} replace />;
  }

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border bg-gradient-to-br from-primary/10 to-transparent p-8 md:p-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium">
              <Shirt className="h-3 w-3 text-primary" /> Demo mode
            </div>
            <h1 className="text-3xl font-bold md:text-4xl">
              Explore the VTON admin portal — no backend required.
            </h1>
            <p className="text-muted-foreground md:text-lg">
              The demo mode lets you click around the full admin UI with mock
              data. No real customers, franchises, or API keys are touched. When
              you're ready to use it for real, sign in with your admin account.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate(ROUTES.DEMO_DASHBOARD)}>
                Launch Demo <ArrowRight className="h-4 w-4" />
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to={ROUTES.SIGNIN}>Sign in instead</Link>
              </Button>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="flex h-40 w-40 items-center justify-center rounded-2xl bg-primary/10">
              <Shirt className="h-20 w-20 text-primary" />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FeatureCard
          icon={Users}
          title="Customers"
          desc="Manage accounts, API keys, and franchises in one place."
        />
        <FeatureCard
          icon={Shirt}
          title="Try-On"
          desc="Submit virtual try-on jobs and preview outputs."
        />
        <FeatureCard
          icon={Activity}
          title="Activity"
          desc="Production analytics with charts and crash reports."
        />
        <FeatureCard
          icon={CreditCard}
          title="Pricing"
          desc="Tiered pricing per customer with active toggles."
        />
      </section>

      <section>
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-xl font-semibold">How the demo works</h2>
            <ol className="ml-6 list-decimal space-y-2 text-sm text-muted-foreground">
              <li>Click "Launch Demo" to enter the demo dashboard.</li>
              <li>You'll see a read-only view of the admin portal with mock data.</li>
              <li>When you're ready, return to the sign-in page to use the real backend.</li>
              <li>
                To disable the demo entirely, set{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  VITE_DEMO_ENABLED=false
                </code>{" "}
                in <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.env</code>.
              </li>
            </ol>
            <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mr-2 inline h-4 w-4" />
              The demo is loosely coupled — it can be safely removed without
              affecting the rest of the app.
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Users;
  title: string;
  desc: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="font-semibold">{title}</div>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </CardContent>
    </Card>
  );
}
