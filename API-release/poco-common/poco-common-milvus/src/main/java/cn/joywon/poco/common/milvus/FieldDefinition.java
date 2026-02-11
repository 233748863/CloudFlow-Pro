package cn.joywon.poco.common.milvus;

class FieldDefinition {

	String idFieldName;

	String textFieldName;

	String metadataFieldName;

	String vectorFieldName;

	String sparseFieldName;

	public FieldDefinition(String idFieldName, String textFieldName, String metadataFieldName, String vectorFieldName,
			String sparseFieldName) {
		this.idFieldName = idFieldName;
		this.textFieldName = textFieldName;
		this.metadataFieldName = metadataFieldName;
		this.vectorFieldName = vectorFieldName;
		this.sparseFieldName = sparseFieldName;
	}

	public String getIdFieldName() {
		return idFieldName;
	}

	public String getTextFieldName() {
		return textFieldName;
	}

	public String getMetadataFieldName() {
		return metadataFieldName;
	}

	public String getVectorFieldName() {
		return vectorFieldName;
	}

	public String getSparseFieldName() {
		return sparseFieldName;
	}

}
