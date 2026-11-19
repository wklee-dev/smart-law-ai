"use client";

import {
  BUTTON_ACTIONS,
  type ButtonAction,
  type ButtonIconName,
  type ButtonSize,
  type ButtonVariant,
} from "./button-actions";
import { ActionIcon } from "./ActionIcon";
import "./button.css";

type NativeButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
>;

export type ButtonProps = NativeButtonProps & {
  /** 표준 액션 — label/icon/variant 기본값 제공. 기능 확인 후 지정 */
  action?: ButtonAction;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ButtonIconName | false;
  iconPosition?: "start" | "end";
  loading?: boolean;
  /** 기본 type=button. form 제출은 명시적으로 submit */
  type?: "button" | "submit" | "reset";
  children?: React.ReactNode;
};

export function Button({
  action,
  variant,
  size = "medium",
  icon,
  iconPosition = "start",
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  "aria-label": ariaLabel,
  title,
  ...rest
}: ButtonProps) {
  const preset = action ? BUTTON_ACTIONS[action] : null;
  const resolvedVariant: ButtonVariant = variant ?? preset?.variant ?? "primary";
  const resolvedIcon: ButtonIconName | false =
    icon === false ? false : (icon ?? (preset ? preset.icon : false));
  const label = children ?? preset?.label ?? null;
  const iconOnly = Boolean(resolvedIcon) && (label == null || label === "");
  const showIcon = resolvedIcon !== false;
  const iconName: ButtonIconName | null = loading
    ? "spinner"
    : showIcon
      ? (resolvedIcon as ButtonIconName)
      : null;
  const iconPx = size === "small" ? 14 : size === "large" ? 16 : 15;

  const classes = [
    "sl-ui-btn",
    `sl-ui-btn--${resolvedVariant}`,
    `sl-ui-btn--${size}`,
    iconOnly ? "sl-ui-btn--icon-only" : "",
    loading ? "sl-ui-btn--loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const a11yLabel = ariaLabel ?? (iconOnly ? preset?.label : undefined);
  const tip = title ?? (iconOnly ? preset?.label : undefined);

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-disabled={disabled || loading || undefined}
      aria-busy={loading || undefined}
      aria-label={a11yLabel}
      title={tip}
      {...rest}
    >
      {iconName && iconPosition === "start" ? <ActionIcon name={iconName} size={iconPx} /> : null}
      {label != null && label !== "" ? <span className="sl-ui-btn__label">{label}</span> : null}
      {iconName && iconPosition === "end" ? <ActionIcon name={iconName} size={iconPx} /> : null}
    </button>
  );
}
