import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Shirt, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { DynamicForm } from "@/client/components/shared/DynamicForm";
import { useSignin } from "@/client/hooks/useAuth";
import { APP_NAME, DEMO_ENABLED, ROUTES } from "@/shared/constants";
import { useToast } from "@/client/hooks/useToast";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SigninValues = z.infer<typeof schema>;

export default function SignInPage() {
  const signin = useSignin();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function onSubmit(values: SigninValues) {
    setLoading(true);
    try {
      await signin.mutateAsync(values);
      toast.success("Welcome back");
      navigate(ROUTES.DASHBOARD);
    } catch {
      // toast handled in useSignin
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Shirt className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{APP_NAME}</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to manage your customers, franchises, and VTON.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Use your admin email and password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DynamicForm
              schema={schema}
              singleColumn
              loading={loading}
              submitLabel="Sign in"
              onSubmit={onSubmit}
              defaultValues={{ email: "", password: "" }}
              fields={[
                {
                  name: "email",
                  label: "Email",
                  type: "email",
                  required: true,
                  placeholder: "admin@example.com",
                },
                {
                  name: "password",
                  label: "Password",
                  type: "password",
                  required: true,
                  placeholder: "••••••••",
                },
              ]}
            />
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 text-sm">
            <div className="text-center text-xs text-muted-foreground">
              Tip: the dev backend seeds an admin user — check the backend README
              for credentials.
            </div>
            {DEMO_ENABLED && (
              <Link
                to={ROUTES.DEMO}
                className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Explore the demo →
              </Link>
            )}
          </CardFooter>
        </Card>

        {loading && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Signing in…
          </div>
        )}
      </div>
    </div>
  );
}
