import { Navigate } from "react-router-dom";
import { Button } from "@/general_components/ui/button";
import { TITLEBAR_HEIGHT } from "@/general_components/TitleBar";
import { useServerAdminPageViewModel } from "@/features/server_admin/viewmodels/useServerAdminPageViewModel";

function StatusPill({ status }) {
  const normalized = String(status || "unknown").toLowerCase();
  const className =
    normalized === "valid"
      ? "bg-emerald-100 text-emerald-800"
      : normalized === "expired"
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${className}`}>
      {normalized}
    </span>
  );
}

function SectionCard({ title, description, children, actions = null }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function ServerAdminPage() {
  const vm = useServerAdminPageViewModel();

  if (!vm.isRuntimeLoading && !vm.isServerRuntime) {
    return <Navigate to="/login" replace />;
  }

  if (vm.principalType === "vendor") {
    return <Navigate to="/vendor-admin" replace />;
  }

  return (
    <div className="bg-background text-foreground" style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)` }}>
      <main className="container mx-auto px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Horalix Pulse Server</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Local server setup, licensing, and user management for the hospital pilot.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={vm.onRefreshPage} disabled={vm.isPageLoading}>
              {vm.isPageLoading ? "Refreshing..." : "Refresh"}
            </Button>
            {vm.user ? (
              <Button variant="ghost" onClick={vm.onLogout}>Logout</Button>
            ) : (
              <Button variant="outline" onClick={vm.onGoToLogin}>Login</Button>
            )}
          </div>
        </div>

        {vm.errorMessage ? (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {vm.errorMessage}
          </div>
        ) : null}

        {vm.successMessage ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {vm.successMessage}
          </div>
        ) : null}

        {vm.isPageLoading ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
            Loading server admin state...
          </div>
        ) : (
          <div className="mt-6 grid gap-6">
            <SectionCard
              title="License"
              description="Export the activation request for signing, then import the signed license file."
              actions={<StatusPill status={vm.licenseStatus?.status} />}
            >
              <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
                <div>
                  <div className="font-medium text-foreground">Customer</div>
                  <div>{vm.licenseStatus?.customer_name || "Not licensed yet"}</div>
                </div>
                <div>
                  <div className="font-medium text-foreground">Expires</div>
                  <div>{vm.licenseStatus?.expires_at || "Not set"}</div>
                </div>
                <div>
                  <div className="font-medium text-foreground">License ID</div>
                  <div>{vm.licenseStatus?.license_id || "Not set"}</div>
                </div>
                <div>
                  <div className="font-medium text-foreground">Features</div>
                  <div>{(vm.licenseStatus?.features || []).join(", ") || "None"}</div>
                </div>
              </div>

              <input
                ref={vm.importInputRef}
                type="file"
                accept=".json,application/json"
                onChange={vm.onImportLicenseFile}
                className="hidden"
              />

              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={vm.onExportActivationRequest}
                  disabled={vm.isExportingActivationRequest}
                >
                  {vm.isExportingActivationRequest ? "Exporting..." : "Export Activation Request"}
                </Button>
                <Button
                  variant="clinical"
                  onClick={vm.onChooseLicenseFile}
                  disabled={vm.isImportingLicense}
                >
                  {vm.isImportingLicense ? "Importing..." : "Import License File"}
                </Button>
              </div>
            </SectionCard>

            <SectionCard
              title="Server Setup"
              description="Bootstrap the first admin on a fresh server before normal login starts."
            >
              <div className="mb-4 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">Setup status</div>
                <div className="mt-1">
                  {vm.bootstrapRequired
                    ? "No users exist yet. Create the first admin now."
                    : `Bootstrap completed. ${vm.seatUsageLabel}`}
                </div>
              </div>

              {vm.bootstrapRequired ? (
                <form className="grid gap-4 md:grid-cols-2" onSubmit={vm.onBootstrapSubmit}>
                  <input
                    value={vm.bootstrapForm.username}
                    onChange={event => vm.onBootstrapFieldChange("username", event.target.value)}
                    placeholder="Admin username"
                    className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                    required
                  />
                  <input
                    value={vm.bootstrapForm.fullName}
                    onChange={event => vm.onBootstrapFieldChange("fullName", event.target.value)}
                    placeholder="Admin full name"
                    className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                    required
                  />
                  <input
                    type="password"
                    value={vm.bootstrapForm.password}
                    onChange={event => vm.onBootstrapFieldChange("password", event.target.value)}
                    placeholder="Admin password"
                    className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary md:col-span-2"
                    required
                  />
                  <div className="md:col-span-2">
                    <Button type="submit" variant="clinical" disabled={vm.isBootstrapping}>
                      {vm.isBootstrapping ? "Creating Admin..." : "Create First Admin"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="text-sm text-muted-foreground">
                  First-admin bootstrap is closed because the server already has users.
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="User Management"
              description="Create, edit, and remove hospital users. The pilot seat cap is enforced by the backend."
            >
              <div className="mb-4 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">Seat usage</div>
                <div className="mt-1">{vm.seatUsageLabel}</div>
              </div>

              {!vm.bootstrapRequired && !vm.user ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <span>Log in as an admin on this server machine to manage users.</span>
                  <Button variant="outline" onClick={vm.onGoToLogin}>Go to Login</Button>
                </div>
              ) : null}

              {!vm.bootstrapRequired && vm.user && !vm.isAdmin ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  Only admins can manage users.
                </div>
              ) : null}

              {vm.canManageUsers ? (
                <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Username</th>
                          <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Full Name</th>
                          <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Role</th>
                          <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-card">
                        {vm.users.map(userRecord => (
                          <tr key={userRecord.id}>
                            <td className="px-4 py-3 text-foreground">{userRecord.username}</td>
                            <td className="px-4 py-3 text-muted-foreground">{userRecord.full_name}</td>
                            <td className="px-4 py-3 text-muted-foreground">{userRecord.role}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => vm.onSelectEditUser(userRecord)}>
                                  Edit
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => vm.onDeleteUser(userRecord.id)}
                                  disabled={vm.deletingUserId === userRecord.id}
                                >
                                  {vm.deletingUserId === userRecord.id ? "Deleting..." : "Delete"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-6">
                    <form className="rounded-xl border border-border bg-card p-5 shadow-sm" onSubmit={vm.onCreateUserSubmit}>
                      <h3 className="text-base font-semibold text-foreground">Create User</h3>
                      <div className="mt-4 grid gap-3">
                        <input
                          value={vm.createForm.username}
                          onChange={event => vm.onCreateFieldChange("username", event.target.value)}
                          placeholder="Username"
                          className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                          required
                        />
                        <input
                          value={vm.createForm.fullName}
                          onChange={event => vm.onCreateFieldChange("fullName", event.target.value)}
                          placeholder="Full name"
                          className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                          required
                        />
                        <input
                          type="password"
                          value={vm.createForm.password}
                          onChange={event => vm.onCreateFieldChange("password", event.target.value)}
                          placeholder="Password"
                          className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                          required
                        />
                        <select
                          value={vm.createForm.role}
                          onChange={event => vm.onCreateFieldChange("role", event.target.value)}
                          className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                        >
                          <option value="doctor">Doctor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="mt-4">
                        <Button type="submit" variant="clinical" disabled={vm.isCreatingUser}>
                          {vm.isCreatingUser ? "Creating..." : "Create User"}
                        </Button>
                      </div>
                    </form>

                    <form className="rounded-xl border border-border bg-card p-5 shadow-sm" onSubmit={vm.onUpdateUserSubmit}>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-semibold text-foreground">Edit User</h3>
                        {vm.editForm.userId ? (
                          <Button type="button" variant="ghost" size="sm" onClick={vm.onCancelEdit}>
                            Clear
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-3">
                        <input
                          value={vm.editForm.username}
                          onChange={event => vm.onEditFieldChange("username", event.target.value)}
                          placeholder="Select a user first"
                          className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                          disabled={!vm.editForm.userId}
                          required
                        />
                        <input
                          value={vm.editForm.fullName}
                          onChange={event => vm.onEditFieldChange("fullName", event.target.value)}
                          placeholder="Full name"
                          className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                          disabled={!vm.editForm.userId}
                          required
                        />
                        <input
                          type="password"
                          value={vm.editForm.password}
                          onChange={event => vm.onEditFieldChange("password", event.target.value)}
                          placeholder="New password (optional)"
                          className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                          disabled={!vm.editForm.userId}
                        />
                        <select
                          value={vm.editForm.role}
                          onChange={event => vm.onEditFieldChange("role", event.target.value)}
                          className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                          disabled={!vm.editForm.userId}
                        >
                          <option value="doctor">Doctor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="mt-4">
                        <Button type="submit" variant="outline" disabled={!vm.editForm.userId || vm.isUpdatingUser}>
                          {vm.isUpdatingUser ? "Saving..." : "Save Changes"}
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : null}
            </SectionCard>
          </div>
        )}
      </main>
    </div>
  );
}
