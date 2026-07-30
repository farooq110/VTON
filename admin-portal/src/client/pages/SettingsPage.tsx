import { useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Switch } from "@/client/components/ui/switch";
import { Separator } from "@/client/components/ui/separator";
import {
  useAppSettings,
  DEFAULT_SETTINGS,
  type FontFamily,
  type FontSize,
} from "@/client/hooks/useAppSettings";
import { useTheme } from "@/client/hooks/useTheme";
import { useAuth } from "@/client/hooks/useAuth";
import { Button } from "@/client/components/ui/button";

export default function SettingsPage() {
  const { settings, update, reset } = useAppSettings();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();

  // Keep theme in sync with app-settings store.
  useEffect(() => {
    if (settings.theme !== theme) update({ theme: theme as any });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize how the portal looks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Theme</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
          <CardDescription>Adjust font family and size.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Font family</Label>
            <Select
              value={settings.fontFamily}
              onValueChange={(v) => update({ fontFamily: v as FontFamily })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="inter">Inter</SelectItem>
                <SelectItem value="geist">Geist</SelectItem>
                <SelectItem value="mono">Mono</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Font size</Label>
            <Select
              value={settings.fontSize}
              onValueChange={(v) => update({ fontSize: v as FontSize })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Small</SelectItem>
                <SelectItem value="md">Medium</SelectItem>
                <SelectItem value="lg">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing tiers</CardTitle>
          <CardDescription>
            Default limits and currency for pricing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Min tiers</Label>
              <Input
                type="number"
                min={1}
                value={settings.pricingTierMin}
                onChange={(e) =>
                  update({ pricingTierMin: Math.max(1, Number(e.target.value)) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max tiers</Label>
              <Input
                type="number"
                min={1}
                value={settings.pricingTierMax}
                onChange={(e) =>
                  update({ pricingTierMax: Math.max(1, Number(e.target.value)) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Currency symbol</Label>
              <Input
                value={settings.currencySymbol}
                onChange={(e) => update({ currencySymbol: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Currency code</Label>
              <Input
                value={settings.currencyCode}
                onChange={(e) => update({ currencyCode: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Stored in localStorage. Defaults: min={DEFAULT_SETTINGS.pricingTierMin},
            max={DEFAULT_SETTINGS.pricingTierMax}, symbol="{DEFAULT_SETTINGS.currencySymbol}",
            code="{DEFAULT_SETTINGS.currencyCode}".
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Organization and notification defaults.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Organization name</Label>
            <Input
              value={settings.orgName}
              onChange={(e) => update({ orgName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Support email</Label>
            <Input
              type="email"
              value={settings.supportEmail}
              onChange={(e) => update({ supportEmail: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default key expiry (days)</Label>
            <Input
              type="number"
              value={settings.defaultKeyExpiryDays}
              onChange={(e) =>
                update({ defaultKeyExpiryDays: Number(e.target.value) })
              }
            />
          </div>
          <Separator />
          <div className="space-y-3">
            <NotificationToggle
              label="Email notifications"
              checked={settings.notifications.email}
              onChange={(v) =>
                update({ notifications: { ...settings.notifications, email: v } })
              }
            />
            <NotificationToggle
              label="Push notifications"
              checked={settings.notifications.push}
              onChange={(v) =>
                update({ notifications: { ...settings.notifications, push: v } })
              }
            />
            <NotificationToggle
              label="In-app notifications"
              checked={settings.notifications.inApp}
              onChange={(v) =>
                update({ notifications: { ...settings.notifications, inApp: v } })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your admin profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{user?.name ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user?.email ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium">{user?.role ?? "admin"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reset settings</CardTitle>
          <CardDescription>Restore defaults.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={reset}>
            Reset to defaults
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
