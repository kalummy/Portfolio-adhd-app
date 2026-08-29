export type AuthenticatedUser = {
  id: string;
};

export type AccountDeletionDependencies = {
  getCurrentUser: () => Promise<{
    user: AuthenticatedUser | null;
    error: unknown;
  }>;
  deleteFeedback: (userId: string) => Promise<{ error: unknown }>;
  deleteAuthUser: (userId: string) => Promise<{ error: unknown }>;
};

export type AccountDeletionErrorCode =
  | "unauthorized"
  | "feedback_delete_failed"
  | "auth_delete_failed";

export class AccountDeletionError extends Error {
  readonly code: AccountDeletionErrorCode;

  constructor(code: AccountDeletionErrorCode) {
    super(code);
    this.name = "AccountDeletionError";
    this.code = code;
  }
}

export async function deleteAuthenticatedAccount(
  dependencies: AccountDeletionDependencies,
): Promise<void> {
  const { user, error: userError } = await dependencies.getCurrentUser();
  if (userError || !user) throw new AccountDeletionError("unauthorized");

  const { error: feedbackError } = await dependencies.deleteFeedback(user.id);
  if (feedbackError) {
    throw new AccountDeletionError("feedback_delete_failed");
  }

  const { error: authError } = await dependencies.deleteAuthUser(user.id);
  if (authError) throw new AccountDeletionError("auth_delete_failed");
}
