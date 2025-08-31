import StudyCard from "./StudyCard";

export default function StudyList({ studies, onSelectStudy, onEdit, onDelete }) {
  return (
    <div className="grid gap-4">
      {studies.map((study) => (
        <StudyCard
          key={study.id}
          study={study}
          onSelectStudy={onSelectStudy}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
