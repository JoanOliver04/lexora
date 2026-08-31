import { describe, expect, it } from "vitest";

import { type ActiveCourse, pickActiveCourse } from "./active-course";

const course = (id: string): ActiveCourse => ({
  id,
  title: `Curso ${id}`,
  targetLocale: "en-GB",
  declaredLevel: "B1",
  startLevel: "A1",
});

describe("pickActiveCourse", () => {
  it("sin cursos devuelve null", () => {
    expect(pickActiveCourse([], null)).toBeNull();
    expect(pickActiveCourse([], "x")).toBeNull();
  });

  it("con el puntero a NULL toma el más antiguo (el primero)", () => {
    const courses = [course("a"), course("b")];
    expect(pickActiveCourse(courses, null)).toBe(courses[0]);
  });

  it("respeta el puntero cuando señala un curso del usuario", () => {
    const courses = [course("a"), course("b")];
    expect(pickActiveCourse(courses, "b")).toBe(courses[1]);
  });

  it("cae al más antiguo si el puntero señala un curso que ya no está", () => {
    const courses = [course("a"), course("b")];
    expect(pickActiveCourse(courses, "borrado")).toBe(courses[0]);
  });
});
