import {
  basekit,
  field,
  FieldCode,
  FieldComponent,
  FieldType,
} from '@lark-opdev/block-basekit-server-api';
import {
  buildConvertRequest,
  extractBackendHost,
  FieldInputError,
} from './field-utils';

const { t } = field;

const BACKEND_URL = process.env.CONVERSION_BACKEND_URL || 'http://127.0.0.1:8787/api/convert';

basekit.addDomainList([extractBackendHost(BACKEND_URL)]);

basekit.addField({
  i18n: {
    messages: {
      'zh-CN': {
        transactionDate: '交易发生日期',
        amount: '原始金额',
        sourceCurrency: '原始币种',
        targetCurrency: '目标币种',
        decimalPlaces: '保留小数位数',
      },
      'en-US': {
        transactionDate: 'Transaction date',
        amount: 'Original amount',
        sourceCurrency: 'Source currency',
        targetCurrency: 'Target currency',
        decimalPlaces: 'Decimal places',
      },
      'ja-JP': {
        transactionDate: '取引日',
        amount: '元の金額',
        sourceCurrency: '換算元通貨',
        targetCurrency: '換算先通貨',
        decimalPlaces: '小数桁数',
      },
    },
  },
  formItems: [
    {
      key: 'transactionDate',
      label: t('transactionDate'),
      component: FieldComponent.FieldSelect,
      props: {
        supportType: [FieldType.DateTime],
      },
      validator: {
        required: true,
      },
    },
    {
      key: 'amount',
      label: t('amount'),
      component: FieldComponent.FieldSelect,
      props: {
        supportType: [FieldType.Number],
      },
      validator: {
        required: true,
      },
    },
    {
      key: 'sourceCurrency',
      label: t('sourceCurrency'),
      component: FieldComponent.FieldSelect,
      props: {
        supportType: [FieldType.Text, FieldType.SingleSelect],
      },
      validator: {
        required: true,
      },
    },
    {
      key: 'targetCurrency',
      label: t('targetCurrency'),
      component: FieldComponent.FieldSelect,
      props: {
        supportType: [FieldType.Text, FieldType.SingleSelect],
      },
      validator: {
        required: true,
      },
    },
    {
      key: 'decimalPlaces',
      label: t('decimalPlaces'),
      component: FieldComponent.SingleSelect,
      props: {
        options: [
          { label: '0', value: '0' },
          { label: '2', value: '2' },
          { label: '4', value: '4' },
          { label: '6', value: '6' },
        ],
      },
      validator: {
        required: true,
      },
    },
  ],
  resultType: {
    type: FieldType.Number,
  },
  execute: async (formItemParams: unknown, context: any) => {
    let requestBody;
    try {
      requestBody = buildConvertRequest(formItemParams as any);
    } catch (error) {
      return {
        code: FieldCode.InvalidArgument,
        msg: formatErrorMessage('invalid_input', error),
      };
    }

    try {
      const response = await context.fetch(BACKEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Base-Signature': context.baseSignature || '',
          'X-Base-Pack-ID': context.packID || '',
        },
        body: JSON.stringify(requestBody),
      });

      const payload = await readJsonResponse(response);
      if (!response.ok || !payload?.ok) {
        return {
          code: mapBackendStatusToFieldCode(response.status),
          msg: `currency_backend_error:${response.status}:${payload?.error?.code || 'unknown'}`,
        };
      }

      const convertedAmount = Number(payload.convertedAmount);
      if (!Number.isFinite(convertedAmount)) {
        return {
          code: FieldCode.Error,
          msg: 'currency_backend_error:invalid_converted_amount',
        };
      }

      return {
        code: FieldCode.Success,
        data: convertedAmount,
      };
    } catch (error) {
      const code = error instanceof FieldInputError ? FieldCode.InvalidArgument : FieldCode.Error;
      return {
        code,
        msg: formatErrorMessage('execute_failed', error),
      };
    }
  },
});

export default basekit;

function mapBackendStatusToFieldCode(status: number) {
  if (status === 401 || status === 403) {
    return FieldCode.AuthorizationError;
  }
  if (status === 400 || status === 404 || status === 422) {
    return FieldCode.InvalidArgument;
  }
  return FieldCode.Error;
}

async function readJsonResponse(response: any): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function formatErrorMessage(scope: string, error: unknown): string {
  if (error instanceof Error) {
    return `currency_${scope}:${error.message}`;
  }
  return `currency_${scope}:unknown`;
}
