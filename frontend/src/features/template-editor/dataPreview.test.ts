import { describe, expect, it } from 'vitest';

import { buildDataPreviewFromReport } from './dataPreview';

describe('buildDataPreviewFromReport', () => {
  it('preserves the technical-report preview keys used by existing templates', () => {
    const report = {
      id: 'report_17',
      metadata: {
        informe_id: 17,
        dia: 2,
        mes: 'FEBRERO',
        anio: 2026,
        pagina: '1 de 2',
        nested: { ignore: true },
      },
      header: {
        cs: 'CS-01',
        contratista: 'Acme',
        codigo_infraestructura: 'INF-99',
        ubicacion: 'Sector Norte',
        suministro: 'Agua',
        tipo: 'ELEVADO',
        volumen: 120,
        nested: { ignore: true },
      },
      inspeccion: {
        caja_registro: true,
        observaciones_caja_registro: 'Con fisuras',
        sugerencias_caja_registro: 'Reparar',
        nested: { ignore: true },
      },
      medidas: {
        largo: 12.5,
        ancho: 4,
        nested: { ignore: true },
      },
      valvulas: {
        diametros: { '2in': true },
        impulsion: { '4in': false },
        aduccion: { '6in': true },
        bypass: { '8in': false },
        desague: { '1in': true },
        operativas: 3,
        no_operativas: 1,
        observaciones_conduccion: 'Oxidadas',
        sugerencias_conduccion: 'Cambiar sello',
        nested: { ignore: true },
      },
      canastillas: {
        diametros: { '3in': true },
        aduccion: { '4in': false },
        succion: { '5in': true },
        desague: { '6in': false },
        operativas: 2,
        no_operativas: 0,
        observaciones_aduccion: 'Sucias',
        sugerencias_aduccion: 'Limpiar',
      },
      observaciones: 'Observacion general',
      sugerencias: 'Sugerencia general',
      status: 'draft',
      attachments: [{ id: 1 }],
    };

    expect(buildDataPreviewFromReport(report, 'technical-report')).toEqual({
      informe_id: 17,
      dia: 2,
      mes: 'FEBRERO',
      anio: 2026,
      pagina: '1 de 2',
      cs: 'CS-01',
      contratista: 'Acme',
      codigo_infraestructura: 'INF-99',
      ubicacion: 'Sector Norte',
      suministro: 'Agua',
      tipo: 'ELEVADO',
      volumen: 120,
      caja_registro: true,
      observaciones_caja_registro: 'Con fisuras',
      obs_caja_registro: 'Con fisuras',
      sugerencias_caja_registro: 'Reparar',
      sug_caja_registro: 'Reparar',
      medidas_largo: 12.5,
      medidas_ancho: 4,
      valvulas_conduccion_2in: true,
      valvulas_impulsion_4in: false,
      valvulas_aduccion_6in: true,
      valvulas_bypass_8in: false,
      valvulas_desague_1in: true,
      valvulas_operativas: 3,
      valvulas_no_operativas: 1,
      obs_valvulas_conduccion: 'Oxidadas',
      sug_valvulas_conduccion: 'Cambiar sello',
      canastillas_aduccion_3in: true,
      canastillas_aduccion_4in: false,
      canastillas_succion_5in: true,
      canastillas_desague_6in: false,
      canastillas_operativas: 2,
      canastillas_no_operativas: 0,
      obs_canastillas_aduccion: 'Sucias',
      sug_canastillas_aduccion: 'Limpiar',
      observaciones: 'Observacion general',
      sugerencias: 'Sugerencia general',
      id: 'report_17',
      status: 'draft',
    });
  });

  it('flattens arbitrary JSON for generic report types', () => {
    const report = {
      metadata: {
        title: 'Quarterly',
        flags: [true, false],
        stats: {
          total: 5,
          ratio: 0.4,
        },
      },
      items: [
        { name: 'alpha', nested: { active: true } },
        { name: 'beta' },
      ],
      ok: true,
      ignored: null,
    };

    expect(buildDataPreviewFromReport(report, 'generic')).toEqual({
      metadata_title: 'Quarterly',
      metadata_flags_0: true,
      metadata_flags_1: false,
      metadata_stats_total: 5,
      metadata_stats_ratio: 0.4,
      items_0_name: 'alpha',
      items_0_nested_active: true,
      items_1_name: 'beta',
      ok: true,
    });
  });
});
