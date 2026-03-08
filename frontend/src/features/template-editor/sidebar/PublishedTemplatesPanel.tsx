import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Library, Search, Pencil, Trash2 } from 'lucide-react';
import { templateEditorApi } from '../api';
import { Badge, Button, Card, Input } from '../ui/ui';

interface PublishedTemplateSummary {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
  updatedAt?: string;
  publishedAt?: string;
}

interface PublishedTemplatesPanelProps {
  refreshKey?: number;
  activeTemplateId?: string | null;
  onUnpublishTemplate?: (templateId: string) => Promise<void> | void;
  onEditPublishedTemplate?: (templateId: string) => Promise<void> | void;
  onDeletePublishedTemplate?: (templateId: string) => Promise<void> | void;
}

function formatDate(value?: string): string {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
  return parsed.toLocaleDateString('es-PE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function PublishedTemplatesPanel({
  refreshKey,
  activeTemplateId,
  onUnpublishTemplate,
  onEditPublishedTemplate,
  onDeletePublishedTemplate,
}: PublishedTemplatesPanelProps) {
  const [templates, setTemplates] = useState<PublishedTemplateSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await templateEditorApi.getPublished();
      const publishedOnly = rows.filter((item) => item.status === 'published');
      setTemplates(publishedOnly);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las plantillas publicadas.');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates, refreshKey]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    if (!term) return templates;
    return templates.filter((item) => item.name.toLocaleLowerCase('es').includes(term));
  }, [search, templates]);

  const handleUnpublish = useCallback(async (item: PublishedTemplateSummary) => {
    const confirmed = window.confirm(`¿Despublicar "${item.name}"?`);
    if (!confirmed) return;

    try {
      setBusyId(item.id);
      if (onUnpublishTemplate) {
        await onUnpublishTemplate(item.id);
      } else {
        await templateEditorApi.unpublish(item.id);
      }
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo despublicar la plantilla.');
    } finally {
      setBusyId(null);
    }
  }, [loadTemplates, onUnpublishTemplate]);

  const handleEdit = useCallback(async (item: PublishedTemplateSummary) => {
    try {
      setBusyId(item.id);
      if (onEditPublishedTemplate) {
        await onEditPublishedTemplate(item.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la plantilla para editar.');
    } finally {
      setBusyId(null);
    }
  }, [onEditPublishedTemplate]);

  const handleDelete = useCallback(async (item: PublishedTemplateSummary) => {
    const confirmed = window.confirm(`¿Eliminar la plantilla "${item.name}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    try {
      setBusyId(item.id);
      if (onDeletePublishedTemplate) {
        await onDeletePublishedTemplate(item.id);
      } else {
        await templateEditorApi.delete(item.id);
      }
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la plantilla.');
    } finally {
      setBusyId(null);
    }
  }, [loadTemplates, onDeletePublishedTemplate]);

  return (
    <div className="flex h-full flex-col p-3 gap-3">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar plantilla publicada"
          className="pl-8"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {loading && (
          <Card className="text-xs text-neutral-500">Cargando plantillas publicadas...</Card>
        )}

        {!loading && error && (
          <Card className="text-xs text-red-600">{error}</Card>
        )}

        {!loading && !error && filtered.length === 0 && (
          <Card className="text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
              <Library size={16} className="text-neutral-400" />
            </div>
            <p className="text-xs text-neutral-500">No hay plantillas publicadas</p>
          </Card>
        )}

        {!loading && !error && filtered.map((item) => {
          const isActive = !!activeTemplateId && activeTemplateId === item.id;
          const publishedAt = item.publishedAt || item.updatedAt;
          const isBusy = busyId === item.id;

          return (
            <Card key={item.id} className={`space-y-2 ${isActive ? 'border-emerald-300 bg-emerald-50/40' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-800">{item.name}</p>
                  <p className="text-xs text-neutral-500">Publicada: {formatDate(publishedAt)}</p>
                </div>
                <Badge tone="success">Publicada</Badge>
              </div>

              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => void handleEdit(item)}
                  disabled={isBusy}
                  title="Editar plantilla"
                >
                  <Pencil size={12} />
                  Editar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => void handleDelete(item)}
                  disabled={isBusy}
                  title="Eliminar plantilla"
                >
                  <Trash2 size={12} />
                  Eliminar
                </Button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-neutral-500"
                onClick={() => void handleUnpublish(item)}
                disabled={isBusy}
              >
                {isBusy ? 'Procesando...' : 'Despublicar'}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
