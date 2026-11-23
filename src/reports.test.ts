import { describe, expect, it, vi } from 'vitest';
import { ApiClient, createMilieuApi, memoryTokenStore } from './client';
import { average, daysBetween, eachDay, emptyByMethod, KpiReportSchema, ratio, reportPeriod, shiftDay } from './reports';

describe('rapports : aides de calcul', () => {
  it('périodes du tableau de bord à partir du jour de la salle', () => {
    expect(reportPeriod('today', '2026-03-15')).toEqual({ from: '2026-03-15', to: '2026-03-15' });
    expect(reportPeriod('7d', '2026-03-03')).toEqual({ from: '2026-02-25', to: '2026-03-03' });
    expect(reportPeriod('30d', '2026-03-30')).toEqual({ from: '2026-03-01', to: '2026-03-30' });
    expect(reportPeriod('month', '2026-03-30')).toEqual({ from: '2026-03-01', to: '2026-03-30' });
    // Mois dernier : février (bissextile ou non), passage d'année.
    expect(reportPeriod('last_month', '2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(reportPeriod('last_month', '2028-03-01')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(reportPeriod('last_month', '2026-01-31')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('jours : décalage, nombre de jours inclus, liste (y compris au changement d’heure)', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-03-29', '2026-03-29')).toBe(1);
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(31);
    expect(eachDay('2026-03-28', '2026-03-31')).toEqual(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
    expect(eachDay('2026-03-02', '2026-03-01')).toEqual([]);
  });

  it('taux et moyennes : null quand il n’y a rien à mesurer (pas 0 %)', () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(1, 3)).toBe(0.3333);
    expect(ratio(5, 5)).toBe(1);
    expect(average(0, 0)).toBeNull();
    expect(average(14, 3)).toBe(4.67);
  });

  it('schéma du rapport : un rapport vide est valide', () => {
    const activity = { sessions: 0, capacity: 0, booked: 0, attended: 0, noShow: 0, lateCancel: 0, fillRate: null, attendanceRate: null };
    const money = { revenueMillimes: 0, rechargeCount: 0, tokensSold: 0, bonusTokens: 0, tokensConsumed: 0 };
    const report = {
      gymId: null, from: '2026-03-01', to: '2026-03-01', days: 1, generatedAt: new Date().toISOString(),
      totals: { ...activity, ...money, byMethod: emptyByMethod(), consumedByReason: { attended: 0, no_show: 0, late_cancel: 0 }, ratingAvg: null, ratingCount: 0 },
      byDay: [{ date: '2026-03-01', ...activity, ...money, byMethod: emptyByMethod() }], byGym: [], byCoach: [], byCashier: [],
    };
    expect(KpiReportSchema.safeParse(report).success).toBe(true);
    expect(KpiReportSchema.safeParse({ ...report, totals: { ...report.totals, fillRate: 1.5 } }).success).toBe(false);
  });
});

describe('rapports : client', () => {
  it('KPI : paramètres de période et de salle ; export CSV lu comme du texte', async () => {
    const calls: { url: string; accept: string }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, accept: headers.Accept! });
      if (url.includes('export.csv')) return new Response('﻿Date;Total\r\n2026-03-01;12,500\r\n', { status: 200, headers: { 'Content-Type': 'text/csv' } });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const api = createMilieuApi(new ApiClient({ baseUrl: 'https://api.test', tokens: memoryTokenStore({ accessToken: 'a' }), fetch: fetchImpl as unknown as typeof fetch, onContractMismatch: () => undefined }));
    await api.reports.kpi({ from: '2026-03-01', to: '2026-03-31', gymId: undefined });
    expect(calls[0]!.url).toBe('https://api.test/api/v1/reports/kpi?from=2026-03-01&to=2026-03-31');
    expect(calls[0]!.accept).toBe('application/json');
    const csv = await api.reports.exportCsv({ kind: 'recharges', from: '2026-03-01', to: '2026-03-01', gymId: 'g1' });
    expect(calls[1]!.url).toBe('https://api.test/api/v1/reports/export.csv?kind=recharges&from=2026-03-01&to=2026-03-01&gymId=g1');
    expect(calls[1]!.accept).toContain('text/csv');
    // Le décodage UTF-8 retire le BOM : l'app le remet en enregistrant le fichier (Excel en a besoin pour les accents).
    expect(csv).toBe('Date;Total\r\n2026-03-01;12,500\r\n');
  });
});
