import { render, screen } from "@testing-library/react";
import MainFileAiVideoMeasurements from "../features/StudyResults/components/AiVideoMeasurements/MainFileAiVideoMeasurements";

describe("MainFileAiVideoMeasurements", () => {
    it("renders empty state", () => {
        render(
            <MainFileAiVideoMeasurements
                state="ready"
                showLoading={false}
                isEmpty={true}
                instances={[]}
                totalInstances={0}
            />
        );

        expect(screen.getByText("No Measurements")).toBeInTheDocument();
    });

    it("renders instance count when available", () => {
        render(
            <MainFileAiVideoMeasurements
                state="ready"
                showLoading={false}
                isEmpty={false}
                instances={[{ sop_instance_uid: "1" }, { sop_instance_uid: "2" }]}
                totalInstances={2}
            />
        );

        expect(screen.getByText("AI Video Analysis")).toBeInTheDocument();
        expect(screen.getByText("2 dicom files analyzed")).toBeInTheDocument();
    });
});
