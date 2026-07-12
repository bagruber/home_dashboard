export type PersonId = "bene" | "sebi" | "mama" | "papa";

export interface Person {
  id: PersonId;
  displayName: string;
  fullName: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}

export const PEOPLE: Person[] = [
  {
    id: "bene",
    displayName: "Bene",
    fullName: "Benedict Gruber",
    textClass: "text-person-bene",
    bgClass: "bg-person-bene",
    borderClass: "border-person-bene",
  },
  {
    id: "sebi",
    displayName: "Sebi",
    fullName: "Sebastian Gruber",
    textClass: "text-person-sebi",
    bgClass: "bg-person-sebi",
    borderClass: "border-person-sebi",
  },
  {
    id: "mama",
    displayName: "Mama",
    fullName: "Asita Djamschidi",
    textClass: "text-person-mama",
    bgClass: "bg-person-mama",
    borderClass: "border-person-mama",
  },
  {
    id: "papa",
    displayName: "Papa",
    fullName: "Bernhard Gruber",
    textClass: "text-person-papa",
    bgClass: "bg-person-papa",
    borderClass: "border-person-papa",
  },
];

const BY_ID: Record<PersonId, Person> = Object.fromEntries(
  PEOPLE.map((p) => [p.id, p]),
) as Record<PersonId, Person>;

export function getPerson(id: string): Person | null {
  return BY_ID[id as PersonId] ?? null;
}

export function isPersonId(id: string): id is PersonId {
  return id in BY_ID;
}
