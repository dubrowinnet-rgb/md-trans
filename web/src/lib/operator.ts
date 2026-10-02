// Реквизиты оператора персональных данных для страницы /privacy/
// (152-ФЗ, ст. 18.1). Пока OPERATOR = null, ссылки на политику нигде не
// показываются, а на самой странице вместо реквизитов стоят подсказки.
export interface OperatorInfo {
  /** «ИП Иванов Иван Иванович» или «ООО «Название»». */
  name: string;
  inn: string;
  /** ОГРН или ОГРНИП. */
  ogrn?: string;
  address?: string;
  /** Куда люди пишут запросы о своих данных. */
  email: string;
}

export const OPERATOR = null as OperatorInfo | null;

/** Дата редакции политики: менять при каждом изменении текста или реквизитов. */
export const PRIVACY_POLICY_DATE = '27 сентября 2026 г.';

export const PRIVACY_PATH = '/privacy/';
