import { render } from "@testing-library/react";
import TitleBar from "./TitleBar";
import { STUDY_RESULTS_CHROME_BG } from "@/features/study_results/model/studyResults.theme";

describe("TitleBar", () => {
  test("uses the shared Study Results chrome color for the dark variant", () => {
    const { container } = render(<TitleBar variant="dark" />);

    expect(container.firstChild).toHaveStyle(`background-color: ${STUDY_RESULTS_CHROME_BG}`);
  });
});
