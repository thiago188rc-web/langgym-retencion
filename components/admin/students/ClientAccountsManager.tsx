"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Search,
  Trash2,
  Link2,
  Unlink,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Phone,
  Mail,
  Loader2,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface WebUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  studentId: string | null;
  studentName: string | null;
  studentIdSocio: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

export function ClientAccountsManager() {
  const [users, setUsers] = useState<WebUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [userToDelete, setUserToDelete] = useState<WebUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  // Linking state
  const [userToLink, setUserToLink] = useState<WebUser | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  // Store students for manual linking
  const students = useStore((s) => s.students);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "No se pudieron cargar las cuentas de usuario.");
      } else {
        setUsers(data.users || []);
      }
    } catch {
      setError("Error de red al conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q)) ||
        (u.studentName && u.studentName.toLowerCase().includes(q)) ||
        (u.studentIdSocio && u.studentIdSocio.toLowerCase().includes(q)),
    );
  }, [users, query]);

  // Handle Delete User
  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    setDeleteSuccess(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_user",
          userId: userToDelete.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Error al eliminar el usuario.");
      } else {
        setDeleteSuccess(`Cuenta de ${userToDelete.fullName} eliminada con éxito.`);
        setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
        setUserToDelete(null);
      }
    } catch {
      alert("Error de conexión al eliminar el usuario.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Unlink Student
  const handleUnlinkStudent = async (userId: string) => {
    if (!confirm("¿Deseás desvincular esta cuenta de su ficha de alumno?")) return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unlink_student",
          userId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? { ...u, studentId: null, studentName: null, studentIdSocio: null }
              : u,
          ),
        );
      } else {
        alert(data.error || "No se pudo desvincular.");
      }
    } catch {
      alert("Error de conexión al desvincular.");
    }
  };

  // Handle Link Student
  const handleLinkStudent = async () => {
    if (!userToLink || !selectedStudentId) return;
    setIsLinking(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link_student",
          userId: userToLink.id,
          studentId: selectedStudentId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const studentObj = students.find((s) => s.id === selectedStudentId);
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userToLink.id
              ? {
                  ...u,
                  studentId: selectedStudentId,
                  studentName: studentObj?.nombreCompleto || "Alumno",
                  studentIdSocio: studentObj?.idSocio || null,
                }
              : u,
          ),
        );
        setUserToLink(null);
        setSelectedStudentId("");
      } else {
        alert(data.error || "No se pudo vincular.");
      }
    } catch {
      alert("Error de conexión al vincular.");
    } finally {
      setIsLinking(false);
    }
  };

  // Filter available students for linking modal
  const candidateStudents = useMemo(() => {
    const q = studentSearch.toLowerCase().trim();
    if (!q) return students.slice(0, 30);
    return students
      .filter(
        (s) =>
          s.nombreCompleto.toLowerCase().includes(q) ||
          s.idSocio.toLowerCase().includes(q) ||
          (s.email && s.email.toLowerCase().includes(q)) ||
          (s.telefonoRaw && s.telefonoRaw.includes(q)),
      )
      .slice(0, 30);
  }, [students, studentSearch]);

  return (
    <div className="space-y-4">
      {/* Header with Search and Refresh */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            placeholder="Buscar por nombre, correo, teléfono o N° socio…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchUsers}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            Actualizar
          </Button>
          <span className="text-xs text-muted">
            {filteredUsers.length} {filteredUsers.length === 1 ? "cuenta" : "cuentas"}
          </span>
        </div>
      </div>

      {deleteSuccess && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-400">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} /> {deleteSuccess}
          </span>
          <button
            onClick={() => setDeleteSuccess(null)}
            className="text-emerald-400 hover:text-white ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-xs text-danger flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted">
          <Loader2 size={32} className="animate-spin mb-3 text-accent" />
          <p className="text-sm">Cargando cuentas de alumnos…</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/40 p-12 text-center">
          <Users size={36} className="mx-auto text-faint mb-3" />
          <h4 className="text-sm font-semibold text-fg">No se encontraron cuentas</h4>
          <p className="text-xs text-muted mt-1">
            {query
              ? "No hay cuentas que coincidan con la búsqueda."
              : "Aún no hay alumnos registrados en la plataforma web."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface/50 text-[11px] uppercase tracking-wider text-muted font-semibold">
                <tr>
                  <th className="px-4 py-3">Alumno / Cuenta</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Ficha SIGA (Socio)</th>
                  <th className="px-4 py-3">Registro</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredUsers.map((u) => {
                  const isLinked = Boolean(u.studentId);
                  return (
                    <tr key={u.id} className="hover:bg-surface/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-fg text-sm">{u.fullName}</div>
                        <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                          <Badge tone={u.role === "admin" ? "danger" : u.role === "profesor" ? "warning" : "accent"}>
                            {u.role}
                          </Badge>
                          <span className="font-mono text-[10px] text-faint truncate max-w-[120px]">
                            {u.id.slice(0, 8)}…
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 space-y-1">
                        <div className="flex items-center gap-1.5 text-fg">
                          <Mail size={12} className="text-faint shrink-0" />
                          <span className="truncate max-w-[200px]">{u.email}</span>
                        </div>
                        {u.phone ? (
                          <div className="flex items-center gap-1.5 text-muted">
                            <Phone size={12} className="text-faint shrink-0" />
                            <span>{u.phone}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-faint">Sin teléfono</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        {isLinked ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Badge tone="success" className="gap-1">
                                <CheckCircle2 size={11} /> Vinculada
                              </Badge>
                              {u.studentIdSocio && (
                                <span className="font-mono font-semibold text-[11px] text-fg">
                                  #{u.studentIdSocio}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted truncate max-w-[180px]">
                              {u.studentName}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <Badge tone="warning" className="gap-1">
                              <AlertTriangle size={11} /> Pendiente
                            </Badge>
                            <div className="text-[10px] text-faint">Sin ficha asociada</div>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-muted text-[11px]">
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="text-faint shrink-0" />
                          <span>{new Date(u.createdAt).toLocaleDateString()}</span>
                        </div>
                        {u.lastSignInAt && (
                          <div className="text-[10px] text-faint mt-0.5">
                            Activo {new Date(u.lastSignInAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right space-x-1.5">
                        {isLinked ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleUnlinkStudent(u.id)}
                            title="Desvincular de la ficha de socio"
                            className="h-8 px-2.5 text-[11px] text-muted hover:text-fg"
                          >
                            <Unlink size={13} className="mr-1" />
                            Desvincular
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setUserToLink(u);
                              setStudentSearch(u.fullName);
                              setSelectedStudentId("");
                            }}
                            title="Vincular a una ficha de socio SIGA"
                            className="h-8 px-2.5 text-[11px] text-accent border-accent/30 hover:bg-accent/10"
                          >
                            <Link2 size={13} className="mr-1" />
                            Vincular
                          </Button>
                        )}

                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setUserToDelete(u)}
                          title="Eliminar usuario para que pueda registrarse de nuevo"
                          className="h-8 px-2.5 text-[11px]"
                        >
                          <Trash2 size={13} className="mr-1" />
                          Eliminar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <Modal
          open={Boolean(userToDelete)}
          onClose={() => !isDeleting && setUserToDelete(null)}
          title="Eliminar cuenta de alumno"
          maxWidth={440}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-danger/25 bg-danger/10 p-3.5 text-xs text-danger flex items-start gap-2.5">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">¿Confirmás que deseás eliminar esta cuenta?</p>
                <p className="text-muted mt-1 leading-relaxed">
                  Esta acción borrará el usuario de acceso web de{" "}
                  <strong className="text-fg">{userToDelete.fullName}</strong> (
                  {userToDelete.email}).
                </p>
                <p className="text-muted mt-1 leading-relaxed">
                  El alumno podrá registrarse nuevamente desde cero con los datos correctos. No se
                  borrará su ficha histórica de SIGA ni sus asistencias.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setUserToDelete(null)}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteUser}
                disabled={isDeleting}
                className="gap-2"
              >
                {isDeleting && <Loader2 size={14} className="animate-spin" />}
                {isDeleting ? "Eliminando…" : "Sí, eliminar cuenta"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Manual Link Student Modal */}
      {userToLink && (
        <Modal
          open={Boolean(userToLink)}
          onClose={() => !isLinking && setUserToLink(null)}
          title="Vincular a Ficha de Socio (SIGA)"
          maxWidth={480}
        >
          <div className="space-y-4">
            <div className="text-xs text-muted">
              Vinculando la cuenta web de{" "}
              <strong className="text-fg">{userToLink.fullName}</strong> ({userToLink.email}) con un
              socio de la base de Lang Gym:
            </div>

            <div className="space-y-2">
              <Input
                placeholder="Buscar socio por nombre, ID o teléfono…"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                autoFocus
              />

              <div className="max-h-60 overflow-y-auto rounded-xl border border-border divide-y divide-border/60">
                {candidateStudents.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted">
                    No se encontraron socios con esa búsqueda.
                  </div>
                ) : (
                  candidateStudents.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStudentId(st.id)}
                      className={cn(
                        "w-full px-3 py-2 text-left text-xs transition-colors flex items-center justify-between",
                        selectedStudentId === st.id
                          ? "bg-accent/15 border-l-2 border-accent text-fg"
                          : "hover:bg-surface/50 text-muted",
                      )}
                    >
                      <div>
                        <span className="font-semibold text-fg">{st.nombreCompleto}</span>
                        <span className="ml-2 font-mono text-[11px] text-faint">#{st.idSocio}</span>
                        {st.email && (
                          <span className="block text-[11px] text-muted">{st.email}</span>
                        )}
                      </div>
                      {selectedStudentId === st.id && (
                        <UserCheck size={16} className="text-accent shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setUserToLink(null)}
                disabled={isLinking}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleLinkStudent}
                disabled={isLinking || !selectedStudentId}
                className="gap-2"
              >
                {isLinking && <Loader2 size={14} className="animate-spin" />}
                {isLinking ? "Vinculando…" : "Confirmar vinculación"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
