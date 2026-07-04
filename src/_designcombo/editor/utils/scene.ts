export const getIdFromClassName = (input: string): string => {
  const regex = /id-([^ ]+)/;
  const match = input.match(regex);
  return match ? match[1] : (null as unknown as string);
};
