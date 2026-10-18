import { describe, expect, it } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import { UserAccount } from '@/domain/auth/user-account';
import { Invoice } from '@/domain/billing/invoice';
import { Procedure } from '@/domain/catalog/procedure';
import { Anamnesis } from '@/domain/clinical/anamnesis';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { ConditionPhoto } from '@/domain/clinical/condition-photo';
import { EvolutionNote } from '@/domain/clinical/evolution-note';
import { FollowUp } from '@/domain/followup/follow-up';
import { Guardian } from '@/domain/guardian/guardian';
import { StockMovement } from '@/domain/inventory/stock-movement';
import { Supply } from '@/domain/inventory/supply';
import { Partner } from '@/domain/partner/partner';
import { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import { Appointment } from '@/domain/scheduling/appointment';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import {
  toAnamnesisDto,
  toAppointmentDto,
  toAssessmentDto,
  toAuditEventDto,
  toConditionDto,
  toConditionPhotoDto,
  toEvolutionNoteDto,
  toFollowUpDto,
  toInvoiceDto,
  toPartnerDto,
  toPatientDto,
  toPortalAppointmentDto,
  toPortalAssessmentDto,
  toPortalConditionDto,
  toPortalPatientProfileDto,
  toProcedureDto,
  toProfessionalDto,
  toReferredPatientSummaryDto,
  toStockMovementDto,
  toSupplyDto,
  toUserAccountDto,
} from '@/lib/dto';

describe('Feature: DTO de paciente', () => {
  it('Dado paciente completo, Quando toPatientDto, Então mapeia todos os campos', () => {
    const patient = Patient.create({
      fullName: 'Maria Silva',
      email: 'maria@clinica.com',
      phone: '11999990000',
      cpf: '529.982.247-25',
      birthDate: new Date('1990-05-20T00:00:00.000Z'),
      notes: 'Alergia a látex',
      referredByPartnerId: 'partner-1',
    });

    const dto = toPatientDto(patient);

    expect(JSON.stringify(dto)).not.toContain('52998224725');
    expect(dto).toEqual({
      id: patient.id,
      fullName: 'Maria Silva',
      email: 'maria@clinica.com',
      phone: '+5511999990000',
      phoneNeedsCorrection: false,
      cpfMasked: '***.***.247-**',
      birthDate: patient.birthDate?.toISOString(),
      notes: 'Alergia a látex',
      referredByPartnerId: 'partner-1',
      guardianId: null,
      guardianPortalRevokedAt: null,
      active: true,
      anonymized: false,
      createdAt: patient.createdAt.toISOString(),
    });
  });

  it('Dado paciente com responsável, Quando toPatientDto com o responsável, Então embute o responsável; sem o argumento, só o id; null explícito, null', () => {
    const guardian = Guardian.create({
      fullName: 'Ana Souza',
      relationship: 'filho',
      phone: '11999990000',
    });
    const patient = Patient.create({
      fullName: 'José Silva',
      phone: '11988887777',
      guardianId: guardian.id,
    });

    expect(toPatientDto(patient, guardian).guardian).toEqual({
      id: guardian.id,
      fullName: 'Ana Souza',
      relationship: 'filho',
      relationshipLabel: 'Filho(a)',
      phone: '+5511999990000',
      email: null,
    });
    expect(toPatientDto(patient)).not.toHaveProperty('guardian');
    expect(toPatientDto(patient).guardianId).toBe(guardian.id);
    expect(toPatientDto(patient, null).guardian).toBeNull();
  });

  it('Dado paciente sem data de nascimento, Quando toPatientDto, Então birthDate é null', () => {
    const patient = Patient.create({
      fullName: 'João Souza',
      email: 'joao@clinica.com',
      phone: '11988887777',
    });

    const dto = toPatientDto(patient);

    expect(dto.birthDate).toBeNull();
    expect(dto.notes).toBeNull();
    expect(dto.referredByPartnerId).toBeNull();
  });

  it('Dado paciente, Quando toPortalPatientProfileDto, Então retorna apenas identificação (sem notas internas)', () => {
    const patient = Patient.create({
      fullName: 'Maria Silva',
      email: 'maria@clinica.com',
      phone: '11999990000',
      notes: 'Nota interna da equipe',
    });

    const dto = toPortalPatientProfileDto(patient);

    expect(dto).toEqual({
      id: patient.id,
      fullName: 'Maria Silva',
      email: 'maria@clinica.com',
      phone: '+5511999990000',
    });
    expect(dto).not.toHaveProperty('notes');
  });

  it('Dado paciente, Quando toReferredPatientSummaryDto, Então retorna apenas id e nome', () => {
    const patient = Patient.create({
      fullName: 'Maria Silva',
      email: 'maria@clinica.com',
      phone: '11999990000',
    });

    expect(toReferredPatientSummaryDto(patient)).toEqual({
      id: patient.id,
      fullName: 'Maria Silva',
    });
  });
});

describe('Feature: DTO de parceiro', () => {
  it('Dado parceiro completo, Quando toPartnerDto, Então mapeia todos os campos', () => {
    const partner = Partner.create({
      fullName: 'Dr. Carlos Souza',
      email: 'carlos@parceiro.com',
      phone: '11977776666',
      crm: 'CRM-SP 123456',
      specialty: 'Cirurgia Geral',
    });

    expect(toPartnerDto(partner)).toEqual({
      id: partner.id,
      fullName: 'Dr. Carlos Souza',
      email: 'carlos@parceiro.com',
      phone: '11977776666',
      crm: 'CRM-SP 123456',
      specialty: 'Cirurgia Geral',
      active: true,
    });
  });
});

describe('Feature: DTO de consulta', () => {
  const slot = TimeSlot.create(
    new Date('2026-04-10T13:00:00.000Z'),
    new Date('2026-04-10T14:00:00.000Z'),
  );

  it('Dado agendamento, Quando toAppointmentDto, Então mapeia campos administrativos completos', () => {
    const appointment = Appointment.create({
      patientId: 'patient-1',
      slot,
      procedure: 'Curativo',
      price: Money.fromCents(15000),
      notes: 'Trazer exames',
      professionalId: 'prof-1',
    });

    const dto = toAppointmentDto(appointment, 'Maria Silva');

    expect(dto).toEqual({
      id: appointment.id,
      patientId: 'patient-1',
      patientName: 'Maria Silva',
      startsAt: slot.start.toISOString(),
      endsAt: slot.end.toISOString(),
      procedure: 'Curativo',
      priceCents: 15000,
      notes: 'Trazer exames',
      status: 'scheduled',
      professionalId: 'prof-1',
      cancelledBy: null,
      cancelledAt: null,
      cancelReason: null,
      cancelledLate: false,
    });
  });

  it('Dado consulta cancelada pelo paciente, Quando mapear, Então a equipe vê origem, data e motivo e o portal só a origem', () => {
    const at = new Date('2026-07-18T10:00:00.000Z');
    const appointment = Appointment.create({
      patientId: 'patient-1',
      slot,
      procedure: 'Curativo',
      price: Money.fromCents(15000),
    }).cancel({ by: 'patient', at, reason: 'Viagem' });

    expect(toAppointmentDto(appointment)).toMatchObject({
      cancelledBy: 'patient',
      cancelledAt: '2026-07-18T10:00:00.000Z',
      cancelReason: 'Viagem',
    });
    const portal = toPortalAppointmentDto(appointment);
    expect(portal.cancelledBy).toBe('patient');
    expect(portal).not.toHaveProperty('cancelReason');
  });

  it('Dado agendamento sem patientName, Quando toAppointmentDto, Então patientName fica undefined', () => {
    const appointment = Appointment.create({
      patientId: 'patient-1',
      slot,
      procedure: 'Curativo',
      price: Money.fromCents(15000),
    });

    expect(toAppointmentDto(appointment).patientName).toBeUndefined();
  });

  it('Dado agendamento, Quando toPortalAppointmentDto, Então oculta preço e notas internas', () => {
    const appointment = Appointment.create({
      patientId: 'patient-1',
      slot,
      procedure: 'Curativo',
      price: Money.fromCents(15000),
      notes: 'Nota interna',
    });

    const dto = toPortalAppointmentDto(appointment);

    expect(dto).toEqual({
      id: appointment.id,
      startsAt: slot.start.toISOString(),
      endsAt: slot.end.toISOString(),
      procedure: 'Curativo',
      status: 'scheduled',
      cancelledBy: null,
    });
    expect(dto).not.toHaveProperty('priceCents');
    expect(dto).not.toHaveProperty('notes');
  });
});

describe('Feature: DTO de fatura', () => {
  it('Dado fatura completa, Quando toInvoiceDto, Então mapeia todos os campos com valores formatados', () => {
    const invoice = Invoice.create({
      patientId: 'patient-1',
      description: 'Consulta de estomaterapia',
      amount: Money.fromCents(20000),
      appointmentId: 'appt-1',
      dueDate: new Date('2026-05-01T00:00:00.000Z'),
    });

    const dto = toInvoiceDto(invoice, 'Maria Silva');

    expect(dto).toEqual({
      id: invoice.id,
      patientId: 'patient-1',
      patientName: 'Maria Silva',
      appointmentId: 'appt-1',
      description: 'Consulta de estomaterapia',
      amountCents: 20000,
      status: 'pending',
      issuedAt: invoice.issuedAt.toISOString(),
      dueDate: invoice.dueDate?.toISOString(),
      paidAt: null,
      paymentMethod: null,
      discountCents: 0,
      discountReason: null,
      netAmountCents: 20000,
      paidCents: 0,
      balanceCents: 20000,
      payments: [],
    });
  });

  it('Dado fatura com desconto e pagamento parcial, Quando toInvoiceDto, Então expõe líquido, recebido, saldo e recebimentos', () => {
    const paidAt = new Date('2026-05-02T10:00:00.000Z');
    const invoice = Invoice.create({
      patientId: 'patient-1',
      description: 'Consulta',
      amount: Money.fromCents(20000),
    })
      .applyDiscount(Money.fromCents(5000), 'Fidelidade')
      .registerPayment({
        amount: Money.fromCents(6000),
        method: 'pix',
        paidAt,
        payer: { name: 'João Souza', cpf: '111.444.777-35' },
      });

    const dto = toInvoiceDto(invoice);

    expect(dto).toMatchObject({
      status: 'pending',
      discountCents: 5000,
      discountReason: 'Fidelidade',
      netAmountCents: 15000,
      paidCents: 6000,
      balanceCents: 9000,
    });
    expect(dto.payments).toEqual([
      {
        id: invoice.payments[0].id,
        amountCents: 6000,
        method: 'pix',
        paidAt: paidAt.toISOString(),
        payer: { name: 'João Souza', cpfMasked: '***.***.777-**' },
      },
    ]);
    expect(JSON.stringify(dto)).not.toContain('11144477735');
  });

  it('Dado fatura paga, Quando toInvoiceDto, Então reflete status e método de pagamento', () => {
    const invoice = Invoice.create({
      patientId: 'patient-1',
      description: 'Consulta',
      amount: Money.fromCents(10000),
    }).markPaid('pix');

    const dto = toInvoiceDto(invoice);

    expect(dto.status).toBe('paid');
    expect(dto.paymentMethod).toBe('pix');
    expect(dto.paidAt).not.toBeNull();
    expect(dto.dueDate).toBeNull();
    expect(dto.appointmentId).toBeNull();
  });
});

describe('Feature: DTO de anamnese', () => {
  it('Dado anamnese preenchida, Quando toAnamnesisDto, Então mapeia todos os campos', () => {
    const anamnesis = Anamnesis.create({
      patientId: 'patient-1',
      comorbidities: 'Diabetes',
      allergies: 'Nenhuma',
      medications: 'Metformina',
      surgicalHistory: 'Apendicectomia',
      notes: 'Acompanhamento regular',
    });

    expect(toAnamnesisDto(anamnesis)).toEqual({
      patientId: 'patient-1',
      comorbidities: 'Diabetes',
      allergies: 'Nenhuma',
      medications: 'Metformina',
      surgicalHistory: 'Apendicectomia',
      notes: 'Acompanhamento regular',
      updatedAt: anamnesis.updatedAt.toISOString(),
    });
  });
});

describe('Feature: DTO de evolução (SOAP)', () => {
  it('Dado nota de evolução, Quando toEvolutionNoteDto, Então mapeia todos os campos', () => {
    const note = EvolutionNote.create({
      patientId: 'patient-1',
      appointmentId: 'appt-1',
      subjective: 'Paciente relata dor leve',
      objective: 'Ferida em processo de cicatrização',
      assessment: 'Evolução favorável',
      plan: 'Manter curativo',
      professionalId: 'prof-1',
    });

    expect(toEvolutionNoteDto(note)).toEqual({
      id: note.id,
      patientId: 'patient-1',
      appointmentId: 'appt-1',
      professionalId: 'prof-1',
      subjective: 'Paciente relata dor leve',
      objective: 'Ferida em processo de cicatrização',
      assessment: 'Evolução favorável',
      plan: 'Manter curativo',
      createdAt: note.createdAt.toISOString(),
    });
  });
});

describe('Feature: DTO de condição clínica', () => {
  it('Dado condição de estomia, Quando toConditionDto, Então mapeia todos os campos', () => {
    const condition = ClinicalCondition.create({
      patientId: 'patient-1',
      kind: 'stoma',
      title: 'Colostomia definitiva',
      stomaType: 'colostomia',
      startedAt: new Date('2026-01-10T00:00:00.000Z'),
      notes: 'Pós-operatório',
    });

    expect(toConditionDto(condition)).toEqual({
      id: condition.id,
      patientId: 'patient-1',
      kind: 'stoma',
      title: 'Colostomia definitiva',
      stomaType: 'colostomia',
      startedAt: condition.startedAt?.toISOString(),
      notes: 'Pós-operatório',
      status: 'active',
      createdAt: condition.createdAt.toISOString(),
    });
  });

  it('Dado condição de ferida sem data de início, Quando toConditionDto, Então startedAt é null', () => {
    const condition = ClinicalCondition.create({
      patientId: 'patient-1',
      kind: 'wound',
      title: 'Ferida no calcanhar',
    });

    const dto = toConditionDto(condition);

    expect(dto.stomaType).toBeNull();
    expect(dto.startedAt).toBeNull();
    expect(dto.notes).toBeNull();
  });

  it('Dado condição com nota interna preenchida, Quando toPortalConditionDto, Então omite notes (allowlist #69)', () => {
    const condition = ClinicalCondition.create({
      patientId: 'patient-1',
      kind: 'stoma',
      title: 'Colostomia definitiva',
      stomaType: 'colostomia',
      startedAt: new Date('2026-01-10T00:00:00.000Z'),
      notes: 'nota interna teste',
    });

    const dto = toPortalConditionDto(condition);

    expect(dto).toEqual({
      id: condition.id,
      patientId: 'patient-1',
      kind: 'stoma',
      title: 'Colostomia definitiva',
      stomaType: 'colostomia',
      startedAt: condition.startedAt?.toISOString(),
      status: 'active',
      createdAt: condition.createdAt.toISOString(),
    });
    expect(dto).not.toHaveProperty('notes');
    expect(JSON.stringify(dto)).not.toContain('nota interna teste');
  });
});

describe('Feature: DTO de avaliação de condição', () => {
  it('Dado avaliação completa, Quando toAssessmentDto, Então mapeia medidas, scores e complicações', () => {
    const assessment = ConditionAssessment.create({
      conditionId: 'condition-1',
      lengthMm: 20,
      widthMm: 10,
      tissueType: 'granulation',
      exudate: 'moderate',
      painScale: 4,
      skinCondition: 'Íntegra ao redor',
      complications: 'Nenhuma',
      complicationCodes: 'dermatitis,bleeding',
      notes: 'Evoluindo bem',
    });

    const dto = toAssessmentDto(assessment);

    expect(dto).toEqual({
      id: assessment.id,
      conditionId: 'condition-1',
      lengthMm: 20,
      widthMm: 10,
      depthMm: null,
      areaMm2: 200,
      tissueType: 'granulation',
      exudate: 'moderate',
      painScale: 4,
      skinCondition: 'Íntegra ao redor',
      complications: 'Nenhuma',
      complicationCodes: ['dermatitis', 'bleeding'],
      detScore: null,
      pushScore: assessment.pushScore,
      notes: 'Evoluindo bem',
      createdAt: assessment.createdAt.toISOString(),
    });
  });

  it('Dado avaliação DET completa (estomia), Quando toAssessmentDto, Então calcula detScore', () => {
    const assessment = ConditionAssessment.create({
      conditionId: 'condition-1',
      detDiscolorationArea: 1,
      detDiscolorationSeverity: 1,
      detErosionArea: 0,
      detErosionSeverity: 0,
      detOvergrowthArea: 2,
      detOvergrowthSeverity: 1,
    });

    expect(toAssessmentDto(assessment).detScore).toBe(5);
  });

  it('Dado avaliação sem medidas, Quando toAssessmentDto, Então campos numéricos e listas ficam vazios/nulos', () => {
    const assessment = ConditionAssessment.create({
      conditionId: 'condition-1',
    });

    const dto = toAssessmentDto(assessment);

    expect(dto.areaMm2).toBeNull();
    expect(dto.complicationCodes).toEqual([]);
    expect(dto.pushScore).toBeNull();
    expect(dto.detScore).toBeNull();
  });

  it('Dado avaliação com nota interna e complicações preenchidas, Quando toPortalAssessmentDto, Então omite notes e complications (allowlist #69, #93)', () => {
    const assessment = ConditionAssessment.create({
      conditionId: 'condition-1',
      lengthMm: 20,
      widthMm: 10,
      tissueType: 'granulation',
      exudate: 'moderate',
      painScale: 4,
      skinCondition: 'Íntegra ao redor',
      complications: 'suspeita de recidiva, encaminhar oncologia',
      complicationCodes: 'dermatitis,bleeding',
      notes: 'nota interna teste',
    });

    const dto = toPortalAssessmentDto(assessment);

    expect(dto).toEqual({
      id: assessment.id,
      conditionId: 'condition-1',
      lengthMm: 20,
      widthMm: 10,
      depthMm: null,
      areaMm2: 200,
      tissueType: 'granulation',
      exudate: 'moderate',
      painScale: 4,
      skinCondition: 'Íntegra ao redor',
      complicationCodes: ['dermatitis', 'bleeding'],
      detScore: null,
      pushScore: assessment.pushScore,
      createdAt: assessment.createdAt.toISOString(),
    });
    expect(dto).not.toHaveProperty('notes');
    expect(dto).not.toHaveProperty('complications');
    expect(JSON.stringify(dto)).not.toContain('nota interna teste');
    expect(JSON.stringify(dto)).not.toContain('suspeita de recidiva');
  });
});

describe('Feature: DTO de insumo', () => {
  it('Dado insumo com estoque acima do mínimo, Quando toSupplyDto, Então isLowStock é false', () => {
    const supply = Supply.create({
      name: 'Placa de estomia',
      unit: 'unidade',
      minQty: 5,
      priceCents: 3000,
    }).registerEntry(10);

    expect(toSupplyDto(supply)).toEqual({
      id: supply.id,
      name: 'Placa de estomia',
      unit: 'unidade',
      minQty: 5,
      priceCents: 3000,
      stockQty: 10,
      isLowStock: false,
      isOutOfStock: false,
      active: true,
    });
  });

  it('Dado insumo com estoque no mínimo, Quando toSupplyDto, Então isLowStock é true', () => {
    const supply = Supply.create({
      name: 'Gaze estéril',
      unit: 'pacote',
      minQty: 3,
      priceCents: 500,
    });

    expect(toSupplyDto(supply).isLowStock).toBe(true);
  });

  it('Dado insumo recém-criado sem mínimo configurado (minQty 0), Quando toSupplyDto, Então isLowStock é false (MAT-02)', () => {
    const supply = Supply.create({
      name: 'Insumo novo',
      unit: 'un',
      minQty: 0,
      priceCents: 100,
    });

    expect(toSupplyDto(supply).isLowStock).toBe(false);
    expect(toSupplyDto(supply).isOutOfStock).toBe(true);
  });

  it('Dado insumo com mínimo configurado e estoque zerado, Quando toSupplyDto, Então isOutOfStock é true (MAT-01)', () => {
    const supply = Supply.create({
      name: 'Bolsa de colostomia',
      unit: 'un',
      minQty: 5,
      priceCents: 3000,
    });

    expect(toSupplyDto(supply).isLowStock).toBe(true);
    expect(toSupplyDto(supply).isOutOfStock).toBe(true);
  });
});

describe('Feature: DTO de movimentação de estoque', () => {
  it('Dado movimentação de saída com preço congelado, Quando toStockMovementDto, Então mapeia todos os campos', () => {
    const movement = StockMovement.create({
      supplyId: 'supply-1',
      type: 'out',
      quantity: 2,
      reason: 'Uso em atendimento',
      appointmentId: 'appt-1',
      unitPriceCents: 1500,
    });

    expect(toStockMovementDto(movement)).toEqual({
      id: movement.id,
      supplyId: 'supply-1',
      type: 'out',
      quantity: 2,
      reason: 'Uso em atendimento',
      appointmentId: 'appt-1',
      unitPriceCents: 1500,
      createdAt: movement.createdAt.toISOString(),
    });
  });
});

describe('Feature: DTO de retorno (follow-up)', () => {
  it('Dado retorno pendente, Quando toFollowUpDto, Então mapeia campos incluindo overdue e nome do paciente', () => {
    const followUp = FollowUp.create({
      patientId: 'patient-1',
      appointmentId: 'appt-1',
      dueDate: new Date('2026-06-01T00:00:00.000Z'),
      reason: 'Reavaliação de curativo',
    });

    const dto = toFollowUpDto(followUp, 'Maria Silva', true);

    expect(dto).toEqual({
      id: followUp.id,
      patientId: 'patient-1',
      patientName: 'Maria Silva',
      appointmentId: 'appt-1',
      dueDate: followUp.dueDate.toISOString(),
      reason: 'Reavaliação de curativo',
      status: 'pending',
      isOverdue: true,
    });
  });

  it('Dado retorno sem patientName/isOverdue informados, Quando toFollowUpDto, Então ambos ficam undefined', () => {
    const followUp = FollowUp.create({
      patientId: 'patient-1',
      dueDate: new Date('2026-06-01T00:00:00.000Z'),
      reason: 'Retorno de rotina',
    });

    const dto = toFollowUpDto(followUp);

    expect(dto.patientName).toBeUndefined();
    expect(dto.isOverdue).toBeUndefined();
    expect(dto.appointmentId).toBeNull();
  });
});

describe('Feature: DTO de evento de auditoria', () => {
  it('Dado evento de auditoria, Quando toAuditEventDto, Então mapeia todos os campos', () => {
    const event = AuditEvent.create({
      clinicId: 'clinic-1',
      actorRole: 'admin',
      actorId: 'maria@clinica.com',
      action: 'read',
      resourceType: 'anamnesis',
      resourceId: 'patient-1',
      patientId: 'patient-1',
      detail: 'visualizou anamnese',
    });

    expect(toAuditEventDto(event)).toEqual({
      id: event.id,
      actorRole: 'admin',
      actorId: 'maria@clinica.com',
      action: 'read',
      resourceType: 'anamnesis',
      resourceId: 'patient-1',
      patientId: 'patient-1',
      detail: 'visualizou anamnese',
      occurredAt: event.occurredAt.toISOString(),
    });
  });
});

describe('Feature: DTO de foto de condição', () => {
  it('Dado foto enviada pela equipe, Quando toConditionPhotoDto, Então mapeia todos os campos (triageStatus null)', () => {
    const photo = ConditionPhoto.create({
      conditionId: 'condition-1',
      contentType: 'image/png',
      sizeBytes: 2048,
      assessmentId: 'assessment-1',
    });

    expect(toConditionPhotoDto(photo)).toEqual({
      id: photo.id,
      conditionId: 'condition-1',
      assessmentId: 'assessment-1',
      contentType: 'image/png',
      sizeBytes: 2048,
      origin: 'staff',
      patientNote: null,
      triageStatus: null,
      createdAt: photo.createdAt.toISOString(),
    });
  });

  it("Dado foto enviada pelo paciente, Quando toConditionPhotoDto, Então triageStatus inicia 'pending'", () => {
    const photo = ConditionPhoto.create({
      conditionId: 'condition-1',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
      origin: 'patient',
      patientNote: 'Está coçando um pouco',
    });

    const dto = toConditionPhotoDto(photo);

    expect(dto.origin).toBe('patient');
    expect(dto.triageStatus).toBe('pending');
    expect(dto.patientNote).toBe('Está coçando um pouco');
  });
});

describe('Feature: DTO de profissional', () => {
  it('Dado profissional completo, Quando toProfessionalDto, Então mapeia todos os campos', () => {
    const professional = Professional.create({
      fullName: 'Enf. Ana Costa',
      registry: 'COREN-SP 654321',
      commissionPct: 30,
    });

    expect(toProfessionalDto(professional)).toEqual({
      id: professional.id,
      fullName: 'Enf. Ana Costa',
      registry: 'COREN-SP 654321',
      commissionType: 'percentage',
      commissionPct: 30,
      commissionFixedCents: null,
      active: true,
    });
  });
});

describe('Feature: DTO de procedimento do catálogo', () => {
  it('Dado procedimento, Quando toProcedureDto, Então mapeia todos os campos', () => {
    const procedure = Procedure.create({
      name: 'Troca de bolsa de colostomia',
      priceCents: 12000,
      durationMinutes: 30,
    });

    expect(toProcedureDto(procedure)).toEqual({
      id: procedure.id,
      name: 'Troca de bolsa de colostomia',
      priceCents: 12000,
      durationMinutes: 30,
      active: true,
      kitItemCount: 0,
    });
  });

  it('Dado kitItemCount informado, Quando toProcedureDto, Então propaga a contagem (PROC-03)', () => {
    const procedure = Procedure.create({
      name: 'Curativo',
      priceCents: 8000,
      durationMinutes: 20,
    });

    expect(toProcedureDto(procedure, 3).kitItemCount).toBe(3);
  });
});

describe('Feature: DTO de conta de usuário', () => {
  it('Dado conta de acesso com senha definida, Quando toUserAccountDto, Então nunca expõe o hash e marca passwordSet', () => {
    const account = UserAccount.create({
      email: 'ana@clinica.com',
      passwordHash: 'scrypt$16384$salt$hash',
      role: 'company_admin',
      clinicId: 'legacy-clinic',
      professionalId: 'prof-1',
    });

    const dto = toUserAccountDto(account);

    expect(dto).toEqual({
      id: account.id,
      email: 'ana@clinica.com',
      role: 'company_admin',
      professionalId: 'prof-1',
      active: true,
      anonymized: false,
      passwordSet: true,
    });
    expect(dto).not.toHaveProperty('passwordHash');
  });

  it('Dado conta recém-criada por convite (senha ainda não definida), Quando toUserAccountDto, Então passwordSet é false', () => {
    const account = UserAccount.create({
      email: 'convidado@clinica.com',
      passwordHash: UNSET_PASSWORD_HASH,
      role: 'atendente',
      clinicId: 'legacy-clinic',
    });

    expect(toUserAccountDto(account).passwordSet).toBe(false);
  });
});
