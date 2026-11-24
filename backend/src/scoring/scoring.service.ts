import { Injectable } from '@nestjs/common';
import { getDeliveryCoverage, requiresTemperatureControl } from '@food-suppliers/shared';
import type {
  RfqTemplate, ScoreBreakdownItem, Supplier, SupplierScoring, SuppliersQueryParams,
} from '@food-suppliers/shared';

type ScoringContext = Pick<SuppliersQueryParams, 'region' | 'maxMoqRub'>;
const hasPriceEstimate = (supplier: Supplier) => supplier.priceEstimate.min !== null || supplier.priceEstimate.max !== null;
const hasRubMoq = (supplier: Supplier) => supplier.moq.unit === 'RUB' && supplier.moq.amount !== null;
const hasPublishedDeliveryTerms = (terms: string) => !/^(по запросу|не указаны?|уточнить|уточняйте|по согласованию)[.!]?$/iu.test(terms.trim()) && Boolean(terms.trim());

const moqClarification = 'Уточнить минимальный заказ и единицу измерения.';
const rubMoqClarification = 'Уточнить минимальную сумму заказа в рублях.';
const pricingClarification = 'Уточнить актуальные цены и минимальный заказ для вашего региона.';
const budgetClarification = (budget: number) => `Уточнить возможность заказа в пределах ${budget} ₽.`;

@Injectable()
export class ScoringService {
  evaluate(supplier: Supplier, context: ScoringContext = {}): SupplierScoring {
    const breakdown: ScoreBreakdownItem[] = [];
    const highlights: string[] = [];
    const clarifications: string[] = [];
    const add = (key: string, label: string, score: number, maxScore: number, detail: string) =>
      breakdown.push({ key, label, score, maxScore, detail });

    let regionScore: number;
    let regionDetail: string;
    if (context.region) {
      const coverage = getDeliveryCoverage(supplier.regions, context.region);
      if (coverage === 'local') {
        regionScore = 30;
        regionDetail = `Регион ${context.region} входит в зону доставки.`;
        highlights.push(`Регион ${context.region} входит в зону доставки.`);
      } else if (coverage === 'federal') {
        regionScore = 22;
        regionDetail = `Регион ${context.region} входит в заявленную доставку по всей РФ.`;
        highlights.push('Заявлены поставки по всей РФ.');
      } else {
        regionScore = 0;
        regionDetail = `Регион ${context.region} не указан в зоне доставки.`;
        clarifications.push(`Уточнить возможность доставки в регион ${context.region}.`);
      }
    } else {
      const base = supplier.regions.includes('Вся РФ') ? 26 : supplier.regions.length > 1 ? 22 : supplier.regions.length === 1 ? 18 : 0;
      const leadBonus = supplier.delivery.leadTime ? 4 : 0;
      regionScore = Math.min(30, base + leadBonus);
      const coverage = supplier.regions.includes('Вся РФ') ? 'вся РФ' : supplier.regions.join(', ') || 'не указано';
      regionDetail = `Покрытие: ${coverage}${leadBonus ? '; срок доставки указан' : ''}.`;
      if (supplier.regions.includes('Вся РФ')) highlights.push('Заявлены поставки по всей РФ.');
      else if (supplier.regions.length > 0) highlights.push(`Указаны регионы: ${supplier.regions.join(', ')}.`);
    }
    add('region', 'Регион и покрытие', regionScore, 30, regionDetail);

    const hasDocuments = supplier.documents.length > 0;
    const hasSystems = supplier.complianceSystems.length > 0;
    const complianceScore = hasDocuments && hasSystems ? 25 : hasDocuments || hasSystems ? 18 : 0;
    if (hasDocuments) highlights.push(`Указаны документы: ${supplier.documents.join(', ')}.`);
    if (hasSystems) highlights.push(`Указаны системы: ${supplier.complianceSystems.join(', ')}.`);
    if (!hasDocuments && !hasSystems) clarifications.push('Проверить декларации соответствия и системы прослеживаемости.');
    add('compliance', 'Документы и комплаенс', complianceScore, 25,
      `${hasDocuments ? 'Документы указаны' : 'Документы не указаны'}; ${hasSystems ? 'системы и стандарты указаны' : 'системы и стандарты не указаны'}.`);

    const hasMoq = supplier.moq.amount !== null;
    const hasPrice = hasPriceEstimate(supplier);
    const phone = Boolean(supplier.contacts.phone?.trim());
    const email = Boolean(supplier.contacts.email?.trim());
    const contactScore = phone && email ? 7 : phone || email ? 4 : 1;
    const transparencyScore = (hasMoq ? 10 : 0) + (hasPrice ? 8 : 0) + contactScore;
    if (hasMoq) highlights.push(`Указана минимальная партия: ${supplier.moq.label}.`);
    else clarifications.push(moqClarification);
    if (hasPrice) highlights.push(`Есть ценовой ориентир: ${supplier.priceEstimate.label}.`);
    else clarifications.push('Запросить актуальный прайс и стоимость нужных позиций.');
    if (supplier.pricingNote?.trim()) clarifications.push(pricingClarification);
    add('transparency', 'Прозрачность условий и контакты', transparencyScore, 25,
      `${phone && email ? 'Есть телефон и email' : phone ? 'Есть телефон' : email ? 'Есть email' : 'Телефон и email не указаны'}; ${hasMoq && hasPrice ? 'есть минимальный заказ и ориентир цены' : hasMoq ? 'минимальный заказ указан, цена по запросу' : hasPrice ? 'есть ориентир цены, минимальный заказ по запросу' : 'минимальный заказ и цена по запросу'}.`);

    const needsCold = requiresTemperatureControl(supplier.category);
    const delivery = supplier.delivery;
    const hasLeadTime = Boolean(delivery.leadTime);
    const hasTerms = hasPublishedDeliveryTerms(delivery.terms);
    const hasBudget = context.maxMoqRub !== undefined;
    let logisticsScore = delivery.hasOwnDelivery === true ? 7 : 0;
    const logisticsDetails = [delivery.hasOwnDelivery === true ? 'Своя доставка' : delivery.hasOwnDelivery === false ? 'Без собственной доставки' : 'Своя доставка не подтверждена'];
    if (delivery.hasOwnDelivery === true) highlights.push('Заявлена собственная доставка.');

    if (needsCold) {
      if (delivery.temperatureControlled === true) {
        logisticsScore += 8;
        logisticsDetails.push('температурный режим подтверждён');
        highlights.push('Подтверждён температурный режим доставки.');
      } else {
        logisticsDetails.push('температурный режим не подтверждён');
        clarifications.push('Уточнить рефрижератор и соблюдение температурного режима при доставке.');
      }
      if (!hasBudget) logisticsScore += hasLeadTime ? 5 : 2;
    } else {
      // When no budget is set, its five points reward published delivery details instead.
      if (hasLeadTime) logisticsScore += hasBudget ? 5 : 8;
      if (hasTerms) logisticsScore += hasBudget ? 3 : 5;
      logisticsDetails.push(hasTerms ? 'условия доставки опубликованы' : 'условия доставки по запросу');
    }
    logisticsDetails.push(hasLeadTime ? 'срок доставки указан' : 'срок доставки не указан');
    if (hasLeadTime) highlights.push(`Указан срок доставки: ${delivery.leadTime}.`);

    if (context.maxMoqRub !== undefined) {
      if (!hasRubMoq(supplier)) {
        logisticsScore += 2;
        logisticsDetails.push('минимальная сумма заказа неизвестна');
        clarifications.push(rubMoqClarification);
      } else if (supplier.moq.amount! <= context.maxMoqRub) {
        logisticsScore += 5;
        logisticsDetails.push('минимальный заказ укладывается в лимит');
      } else {
        logisticsDetails.push('минимальный заказ превышает лимит');
        clarifications.push(budgetClarification(context.maxMoqRub));
      }
    }
    add('logistics', 'Логистика и соответствие запросу', logisticsScore, 20, logisticsDetails.join('; ') + '.');

    const total = breakdown.reduce((sum, item) => sum + item.score, 0);
    const verdict = total >= 75 ? 'recommended' : total >= 55 ? 'consider' : 'clarify';
    const verdictLabel = verdict === 'recommended' ? 'Рекомендуем связаться в первую очередь'
      : verdict === 'consider' ? 'Хороший вариант' : 'Требует уточнений';
    return { total, verdict, verdictLabel, breakdown, highlights: highlights.slice(0, 4), clarifications: [...new Set(clarifications)] };
  }

  buildRfqTemplate(supplier: Supplier, scoring: SupplierScoring, context: ScoringContext = {}): RfqTemplate {
    const questions: string[] = [];
    const hasPricingNote = Boolean(supplier.pricingNote?.trim());
    const budget = context.maxMoqRub;
    const unknownRubMoq = budget !== undefined && !hasRubMoq(supplier);
    const aboveBudget = budget !== undefined && hasRubMoq(supplier) && supplier.moq.amount! > budget;
    const needsMoq = supplier.moq.amount === null || supplier.moq.unit === null || hasPricingNote || unknownRubMoq;
    const orderClarifications = new Set([moqClarification, rubMoqClarification, pricingClarification]);
    if (budget !== undefined) orderClarifications.add(budgetClarification(budget));
    const checklist = scoring.clarifications.filter(item => !orderClarifications.has(item));
    if (!hasPriceEstimate(supplier) || hasPricingNote) {
      questions.push('Можете направить нам актуальный оптовый прайс-лист на ваш ассортимент?');
    }
    if (needsMoq) questions.push('Каковы минимальный объём или сумма заказа и условия отгрузки?');
    if (aboveBudget) questions.push(`Можем ли мы оформить заказ на сумму до ${budget.toLocaleString('ru-RU')} ₽?`);
    if (needsMoq || aboveBudget) {
      const minimum = unknownRubMoq ? 'минимальную сумму заказа в рублях' : 'минимальный заказ (сумму или объём)';
      const order = hasPricingNote ? `условия по выбранным позициям: актуальные цены и ${minimum}` : minimum;
      checklist.push(aboveBudget
        ? needsMoq ? `Уточнить ${order}, а также возможность заказа в пределах ${budget} ₽.` : budgetClarification(budget)
        : `Уточнить ${order}.`);
    }
    if (!supplier.documents.length) {
      questions.push('Можете подтвердить наличие деклараций соответствия на нужные нам позиции и работу с профильными системами, если они применимы?');
      if (supplier.complianceSystems.length) checklist.push('Запросить декларации и другие документы на выбранную продукцию.');
    }
    if (requiresTemperatureControl(supplier.category) && supplier.delivery.temperatureControlled !== true) {
      questions.push('Какой температурный режим вы поддерживаете при перевозке и на каких условиях доставляете заказ?');
    }
    if (context.region && !getDeliveryCoverage(supplier.regions, context.region)) {
      questions.push(`Можете ли вы доставить наш заказ в регион «${context.region}»?`);
    }
    if (!questions.length) questions.push('Можете подтвердить наличие товара, сроки поставки и условия оплаты?');
    if (!checklist.length) checklist.push('Подтвердить наличие, сроки поставки и условия оплаты.');
    return {
      subject: `Запрос коммерческого предложения: ${supplier.categoryLabel} — ${supplier.name}`,
      body: `Здравствуйте!\n\nРассматриваем «${supplier.name}» как поставщика по направлению «${supplier.categoryLabel}». Будем благодарны за коммерческое предложение и ответы на несколько вопросов:\n\n${questions.map(question => `• ${question}`).join('\n')}\n\nПожалуйста, укажите срок действия предложения и контакт для обсуждения заказа.\n\nС уважением,\nОтдел закупок`,
      checklist: [...new Set(checklist)],
    };
  }
}
