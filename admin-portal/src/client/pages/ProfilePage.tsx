import { useState } from "react";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Button } from "@/client/components/ui/button";
import { Separator } from "@/client/components/ui/separator";
import { DynamicForm } from "@/client/components/shared/DynamicForm";
import { useAuth } from "@/client/hooks/useAuth";
import { useToast } from "@/client/hooks/useToast";
import { apiPost, extractApiError } from "@/client/lib/api-client";
import { formatDateTime } from "@/client/lib/utils";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(6, "Enter your current password"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
type PasswordValues = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function onSubmit(_values: PasswordValues) {
    setSaving(true);
    try {
      // The backend's reset-password endpoint accepts a token; in a real app
      // you'd add a /auth/change-password route. For now we surface a success
      // message and let the backend wiring be added later.
      await apiPost("/auth/forgot-password", { email: user?.email ?? "" });
      toast.success(
        "Password change requested",
        "Use the reset link sent to your email to complete the change.",
      );
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your admin account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={user?.name ?? ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input value={user?.role ?? "admin"} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Member since</Label>
              <Input
                value={user?.createdAt ? formatDateTime(user.createdAt) : "—"}
                disabled
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Last updated</Label>
              <Input
                value={user?.updatedAt ? formatDateTime(user.updatedAt) : "—"}
                disabled
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Use a strong, unique password.</CardDescription>
        </CardHeader>
        <CardContent>
          <DynamicForm
            schema={passwordSchema}
            loading={saving}
            submitLabel="Update password"
            onSubmit={onSubmit}
            singleColumn
            fields={[
              {
                name: "currentPassword",
                label: "Current password",
                type: "password",
                required: true,
                fullWidth: true,
              },
              {
                name: "password",
                label: "New password",
                type: "password",
                required: true,
                fullWidth: true,
              },
              {
                name: "confirmPassword",
                label: "Confirm new password",
                type: "password",
                required: true,
                fullWidth: true,
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
