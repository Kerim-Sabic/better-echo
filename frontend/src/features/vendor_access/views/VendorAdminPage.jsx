import { useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";

import { TITLEBAR_HEIGHT } from "@/general_components/TitleBar";
import { Button } from "@/general_components/ui/button";
import { formatDateTime } from "@/general_components/utility/dateUtils";
import { useVendorAccessPageViewModel } from "@/features/vendor_access/viewmodels/useVendorAccessPageViewModel";

function SectionCard({ title, description, actions = null, children }) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

export default function VendorAdminPage() {
  const vm = useVendorAccessPageViewModel();
  const logViewportRef = useRef(null);

  useEffect(() => {
    if (!logViewportRef.current) {
      return;
    }
    logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight;
  }, [vm.logLines]);

  if (!vm.isRuntimeLoading && (!vm.isServerRuntime || !vm.hasAuthenticatedUser)) {
    return <Navigate to="/login" replace />;
  }

  if (!vm.isRuntimeLoading && vm.hasAuthenticatedUser && !vm.isVendor) {
    return <Navigate to={vm.isAdmin ? "/server-admin" : "/dashboard"} replace />;
  }

  return (
    <div
      className="bg-background text-foreground"
      style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)` }}
    >
      <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-foreground">Vendor Access</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Hidden packaged-server support console for cross-study monitoring and recovery.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{vm.pageTitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={vm.onRefresh} disabled={vm.isRefreshing}>
              {vm.isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              variant="outline"
              onClick={vm.onDownloadStudiesExport}
              disabled={vm.isDownloadingStudiesExport}
            >
              {vm.isDownloadingStudiesExport ? "Preparing Export..." : "Download Studies Export"}
            </Button>
            <Button
              variant="outline"
              onClick={vm.onDownloadLogs}
              disabled={vm.isDownloadingLogs}
            >
              {vm.isDownloadingLogs ? "Downloading Logs..." : "Download Logs"}
            </Button>
            <Button variant="ghost" onClick={vm.onLogout}>Logout</Button>
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
            Loading vendor access state...
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-12 gap-6">
            <div className="col-span-12">
              <SectionCard
                title={`Studies (${vm.totalItems})`}
                description="Newest studies first. Open read-only study results or download a full archive."
              >
                <div className="min-w-0 overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Study UID</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Patient</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Owner</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Uploaded</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {vm.studies.map(study => (
                        <tr key={study.study_uid}>
                          <td className="max-w-[26rem] px-4 py-3 text-foreground">
                            <div className="break-all">{study.study_uid}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <div>{study.patient?.patient_name || "-"}</div>
                            <div className="text-xs">{study.patient?.patient_id || "-"}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <div>{study.owner?.full_name || study.owner?.username || "-"}</div>
                            <div className="text-xs">{study.owner?.username || "-"}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDateTime(study.uploaded_at)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{study.status || "-"}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => vm.onOpenStudy(study.study_uid)}
                            >
                              Open
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {vm.studies.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                            No studies found.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                  <div>
                    Page {vm.page} of {vm.totalPages || 1}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={vm.onPreviousPage}
                      disabled={vm.page <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={vm.onNextPage}
                      disabled={vm.totalPages > 0 && vm.page >= vm.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </div>

            <div className="col-span-12 xl:col-span-6">
              <SectionCard
                title="User Activity & Access"
                description="View last login / study activity and manage hospital accounts."
              >
                <div className="min-w-0 overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">User</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Role</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Last Login</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Last Study</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {vm.users.map(userRecord => (
                        <tr key={userRecord.id}>
                          <td className="px-4 py-3 text-muted-foreground">
                            <div className="text-foreground">{userRecord.full_name || userRecord.username}</div>
                            <div className="text-xs">{userRecord.username}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{userRecord.role}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {userRecord.last_login_at ? formatDateTime(userRecord.last_login_at) : "Never"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {userRecord.last_study_created_at
                              ? formatDateTime(userRecord.last_study_created_at)
                              : "Never"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => vm.onSelectEditUser(userRecord)}
                              >
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
                      {vm.users.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                            No users found.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <form
                    className="rounded-xl border border-border bg-card p-5 shadow-sm"
                    onSubmit={vm.onCreateUserSubmit}
                  >
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
                      <select
                        value={vm.createForm.role}
                        onChange={event => vm.onCreateFieldChange("role", event.target.value)}
                        className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                      >
                        <option value="doctor">Doctor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <input
                        type="password"
                        value={vm.createForm.password}
                        onChange={event => vm.onCreateFieldChange("password", event.target.value)}
                        placeholder="Password"
                        className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                        required
                      />
                      <Button type="submit" variant="clinical" disabled={vm.isCreatingUser}>
                        {vm.isCreatingUser ? "Creating..." : "Create User"}
                      </Button>
                    </div>
                  </form>

                  <form
                    className="rounded-xl border border-border bg-card p-5 shadow-sm"
                    onSubmit={vm.onUpdateUserSubmit}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-foreground">Edit User</h3>
                      {vm.editForm.userId ? (
                        <Button variant="ghost" size="sm" type="button" onClick={vm.onCancelEdit}>
                          Clear
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-4 grid gap-3">
                      <input
                        value={vm.editForm.username}
                        onChange={event => vm.onEditFieldChange("username", event.target.value)}
                        placeholder="Select a user from the table"
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
                      <select
                        value={vm.editForm.role}
                        onChange={event => vm.onEditFieldChange("role", event.target.value)}
                        className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                        disabled={!vm.editForm.userId}
                      >
                        <option value="doctor">Doctor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <input
                        type="password"
                        value={vm.editForm.password}
                        onChange={event => vm.onEditFieldChange("password", event.target.value)}
                        placeholder="New password (optional)"
                        className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                        disabled={!vm.editForm.userId}
                      />
                      <Button
                        type="submit"
                        variant="clinical"
                        disabled={!vm.editForm.userId || vm.isUpdatingUser}
                      >
                        {vm.isUpdatingUser ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </form>
                </div>
              </SectionCard>
            </div>

            <div className="col-span-12 xl:col-span-6">
              <SectionCard
                title="Backend Logs"
                description="Last 200 lines from the active backend log. The viewport stays pinned to the latest entries."
              >
                <div className="mb-3 text-xs text-muted-foreground">
                  <div className="break-all">{vm.logsPath || "No active log file"}</div>
                  <div>{vm.logsUpdatedAt ? `Updated ${vm.logsUpdatedAt}` : "No log timestamp available"}</div>
                </div>
                <div className="rounded-xl border border-border bg-muted/60 p-3">
                  <pre
                    ref={logViewportRef}
                    className="max-h-[720px] overflow-auto whitespace-pre-wrap break-words text-xs text-foreground"
                  >
                    {vm.logLines.length ? vm.logLines.join("\n") : "No log lines available."}
                  </pre>
                </div>
              </SectionCard>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
