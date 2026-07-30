import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z, ZodType } from "zod";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Switch } from "@/client/components/ui/switch";
import { VoiceButton } from "@/client/components/shared/VoiceButton";
import { CascadingAddress } from "@/client/components/shared/CascadingAddress";
import { Loader2 } from "lucide-react";
import { apiGet } from "@/client/lib/api-client";
import { cn } from "@/client/lib/utils";

export type FieldType =
  | "text"
  | "email"
  | "password"
  | "number"
  | "tel"
  | "textarea"
  | "select"
  | "switch"
  | "async-select"
  | "cascading-address";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { label: string; value: string }[];
  /** For async-select: API endpoint that returns { items: { id, name }[] } */
  endpoint?: string;
  /** Map an async item to { label, value } */
  itemLabel?: (item: any) => string;
  itemValue?: (item: any) => string;
  required?: boolean;
  disabled?: boolean;
  /** Full width (1 col) — defaults to false (1 of 2 cols). */
  fullWidth?: boolean;
  helperText?: string;
  /** Voice input — adds a mic button next to text/textarea fields. */
  voice?: boolean;
}

export interface DynamicFormProps<T extends ZodType> {
  schema: T;
  fields: FieldConfig[];
  defaultValues?: Partial<z.infer<T>>;
  onSubmit: (values: z.infer<T>) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  /** Single-column layout instead of the default 2-col grid. */
  singleColumn?: boolean;
  className?: string;
}

export function DynamicForm<T extends ZodType>({
  schema,
  fields,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  loading = false,
  singleColumn = false,
  className,
}: DynamicFormProps<T>) {
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<z.infer<T>>({
    resolver: zodResolver(schema),
    defaultValues: (defaultValues ?? {}) as any,
  });

  useEffect(() => {
    if (defaultValues) reset((defaultValues as any) ?? {});
  }, [defaultValues, reset]);

  return (
    <form
      onSubmit={handleSubmit((v) => onSubmit(v as z.infer<T>))}
      className={cn("space-y-4", className)}
      noValidate
    >
      <div
        className={cn(
          "grid gap-4",
          singleColumn ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
        )}
      >
        {fields.map((field) => {
          const isFull =
            singleColumn ||
            field.fullWidth ||
            field.type === "textarea" ||
            field.type === "cascading-address";
          const errorMsg = (errors as any)?.[field.name]?.message as
            | string
            | undefined;
          return (
            <div
              key={field.name}
              className={cn("space-y-1.5", isFull && "md:col-span-2")}
            >
              <Label htmlFor={field.name}>
                {field.label}
                {field.required && <span className="ml-1 text-destructive">*</span>}
              </Label>

              <Controller
                control={control}
                name={field.name as any}
                render={({ field: f }) => {
                  switch (field.type) {
                    case "textarea":
                      return (
                        <div className="flex gap-2">
                          <Textarea
                            id={field.name}
                            placeholder={field.placeholder}
                            disabled={field.disabled}
                            value={(f.value as string) ?? ""}
                            onChange={f.onChange}
                            onBlur={f.onBlur}
                          />
                          {field.voice && (
                            <VoiceButton
                              onTranscript={(t) =>
                                f.onChange(((f.value as string) ?? "") + " " + t)
                              }
                            />
                          )}
                        </div>
                      );
                    case "select":
                      return (
                        <Select
                          value={(f.value as string) ?? ""}
                          onValueChange={f.onChange}
                          disabled={field.disabled}
                        >
                          <SelectTrigger id={field.name}>
                            <SelectValue placeholder={field.placeholder} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    case "switch":
                      return (
                        <div className="flex items-center gap-3 pt-1">
                          <Switch
                            id={field.name}
                            checked={!!f.value}
                            onCheckedChange={f.onChange}
                            disabled={field.disabled}
                          />
                          <span className="text-sm text-muted-foreground">
                            {f.value ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      );
                    case "async-select":
                      return (
                        <AsyncSelectField
                          field={field}
                          value={(f.value as string) ?? ""}
                          onChange={f.onChange}
                          disabled={field.disabled}
                        />
                      );
                    case "cascading-address":
                      return (
                        <CascadingAddress
                          value={(f.value as any) ?? {}}
                          onChange={(v) => f.onChange(v as any)}
                        />
                      );
                    case "number":
                      return (
                        <Input
                          id={field.name}
                          type="number"
                          placeholder={field.placeholder}
                          disabled={field.disabled}
                          value={(f.value as number | string) ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            f.onChange(v === "" ? undefined : Number(v));
                          }}
                          onBlur={f.onBlur}
                        />
                      );
                    default:
                      return (
                        <div className="flex gap-2">
                          <Input
                            id={field.name}
                            type={field.type}
                            placeholder={field.placeholder}
                            disabled={field.disabled}
                            value={(f.value as string) ?? ""}
                            onChange={f.onChange}
                            onBlur={f.onBlur}
                          />
                          {field.voice && (
                            <VoiceButton
                              onTranscript={(t) =>
                                f.onChange(((f.value as string) ?? "") + " " + t)
                              }
                            />
                          )}
                        </div>
                      );
                  }
                }}
              />

              {field.helperText && !errorMsg && (
                <p className="text-xs text-muted-foreground">
                  {field.helperText}
                </p>
              )}
              {errorMsg && (
                <p className="text-xs text-destructive">{errorMsg}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading || isSubmitting}
          >
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" disabled={loading || isSubmitting}>
          {loading || isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}

function AsyncSelectField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldConfig;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!field.endpoint) return;
    setLoading(true);
    apiGet<{ items: any[] }>(field.endpoint)
      .then((res) => {
        if (cancelled) return;
        const items = res.items ?? [];
        setOptions(
          items.map((item) => ({
            label: field.itemLabel ? field.itemLabel(item) : String(item.name ?? item.id),
            value: field.itemValue ? field.itemValue(item) : String(item.id),
          })),
        );
      })
      .catch(() => void 0)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [field.endpoint, field.itemLabel, field.itemValue]);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || loading}>
      <SelectTrigger id={field.name}>
        <SelectValue placeholder={loading ? "Loading…" : field.placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
