/** @type {Record<string, string | Record<string, string>>} */
const colors = {
  base: {
    black: "var(--color-base-black)",
    white: "var(--color-base-white)"
  },
  mint: {
    50: "var(--color-mint-50)",
    100: "var(--color-mint-100)",
    200: "var(--color-mint-200)",
    300: "var(--color-mint-300)",
    400: "var(--color-mint-400)",
    500: "var(--color-mint-500)",
    600: "var(--color-mint-600)",
    700: "var(--color-mint-700)",
    800: "var(--color-mint-800)",
    900: "var(--color-mint-900)"
  },
  blue: {
    50: "var(--color-blue-50)",
    100: "var(--color-blue-100)",
    200: "var(--color-blue-200)",
    300: "var(--color-blue-300)",
    400: "var(--color-blue-400)",
    500: "var(--color-blue-500)",
    600: "var(--color-blue-600)",
    700: "var(--color-blue-700)",
    800: "var(--color-blue-800)",
    900: "var(--color-blue-900)"
  },
  gray: {
    50: "var(--color-gray-50)",
    75: "var(--color-gray-75)",
    100: "var(--color-gray-100)",
    150: "var(--color-gray-150)",
    200: "var(--color-gray-200)",
    300: "var(--color-gray-300)",
    400: "var(--color-gray-400)",
    500: "var(--color-gray-500)",
    600: "var(--color-gray-600)",
    700: "var(--color-gray-700)",
    800: "var(--color-gray-800)",
    900: "var(--color-gray-900)"
  },
  orange: {
    50: "var(--color-orange-50)",
    100: "var(--color-orange-100)",
    200: "var(--color-orange-200)",
    300: "var(--color-orange-300)",
    400: "var(--color-orange-400)",
    500: "var(--color-orange-500)",
    600: "var(--color-orange-600)"
  },
  red: {
    50: "var(--color-red-50)",
    100: "var(--color-red-100)",
    200: "var(--color-red-200)",
    300: "var(--color-red-300)",
    400: "var(--color-red-400)",
    500: "var(--color-red-500)",
    600: "var(--color-red-600)"
  },
  green: {
    50: "var(--color-green-50)",
    100: "var(--color-green-100)",
    200: "var(--color-green-200)",
    300: "var(--color-green-300)",
    400: "var(--color-green-400)",
    500: "var(--color-green-500)",
    600: "var(--color-green-600)"
  },
  bg: {
    base: {
      "01": "var(--color-bg-base-01)",
      "02": "var(--color-bg-base-02)",
      "03": "var(--color-bg-base-03)",
      "04": "var(--color-bg-base-04)",
      "05": "var(--color-bg-base-05)"
    },
    interactive: {
      brand: {
        default: "var(--color-bg-interactive-brand-default)",
        pressed: "var(--color-bg-interactive-brand-pressed)",
        focused: "var(--color-bg-interactive-brand-focused)",
        disabled: "var(--color-bg-interactive-brand-disabled)"
      },
      gray: {
        default: "var(--color-bg-interactive-gray-default)",
        pressed: "var(--color-bg-interactive-gray-pressed)",
        focused: "var(--color-bg-interactive-gray-focused)",
        disabled: "var(--color-bg-interactive-gray-disabled)"
      },
      neutral: {
        default: "var(--color-bg-interactive-neutral-default)",
        pressed: "var(--color-bg-interactive-neutral-pressed)",
        focused: "var(--color-bg-interactive-neutral-focused)",
        disabled: "var(--color-bg-interactive-neutral-disabled)"
      },
      mint: {
        default: "var(--color-bg-interactive-mint-default)",
        pressed: "var(--color-bg-interactive-mint-pressed)",
        focused: "var(--color-bg-interactive-mint-focused)",
        disabled: "var(--color-bg-interactive-mint-disabled)"
      }
    }
  },
  font: {
    base: {
      "01": "var(--color-font-base-01)",
      "02": "var(--color-font-base-02)",
      "03": "var(--color-font-base-03)",
      "04": "var(--color-font-base-04)",
      "05": "var(--color-font-base-05)",
      "06": "var(--color-font-base-06)"
    },
    primary: "var(--color-font-primary)",
    semantic: {
      danger: "var(--color-font-semantic-danger)",
      warning: "var(--color-font-semantic-warning)",
      success: "var(--color-font-semantic-success)"
    }
  },
  border: {
    base: {
      "01": "var(--color-border-base-01)",
      "02": "var(--color-border-base-02)",
      "03": "var(--color-border-base-03)",
      "04": "var(--color-border-base-04)",
      "05": "var(--color-border-base-05)"
    },
    focus: {
      default: "var(--color-border-focus-default)",
      strong: "var(--color-border-focus-strong)"
    },
    semantic: {
      danger: "var(--color-border-semantic-danger)",
      warning: "var(--color-border-semantic-warning)",
      success: "var(--color-border-semantic-success)"
    }
  },
  brand: {
    primary: "var(--color-brand-primary)"
  }
};

module.exports = colors;
