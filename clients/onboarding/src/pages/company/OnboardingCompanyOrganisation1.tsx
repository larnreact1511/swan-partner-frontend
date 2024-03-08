import { LakeAlert } from "@swan-io/lake/src/components/LakeAlert";
import { LakeLabel } from "@swan-io/lake/src/components/LakeLabel";
import { LakeText } from "@swan-io/lake/src/components/LakeText";
import { LakeTextInput } from "@swan-io/lake/src/components/LakeTextInput";
import { RadioGroup } from "@swan-io/lake/src/components/RadioGroup";
import { ResponsiveContainer } from "@swan-io/lake/src/components/ResponsiveContainer";
import { Space } from "@swan-io/lake/src/components/Space";
import { Tile } from "@swan-io/lake/src/components/Tile";
import { breakpoints, negativeSpacings } from "@swan-io/lake/src/constants/design";
import { useFirstMountState } from "@swan-io/lake/src/hooks/useFirstMountState";
import { useUrqlMutation } from "@swan-io/lake/src/hooks/useUrqlMutation";
import { useUrqlQuery } from "@swan-io/lake/src/hooks/useUrqlQuery";
import { showToast } from "@swan-io/lake/src/state/toasts";
import { noop } from "@swan-io/lake/src/utils/function";
import { emptyToUndefined } from "@swan-io/lake/src/utils/nullish";
import { filterRejectionsToResult } from "@swan-io/lake/src/utils/urql";
import {
  AddressDetail,
  PlacekitAddressSearchInput,
} from "@swan-io/shared-business/src/components/PlacekitAddressSearchInput";
import { TaxIdentificationNumberInput } from "@swan-io/shared-business/src/components/TaxIdentificationNumberInput";
import { CountryCCA3 } from "@swan-io/shared-business/src/constants/countries";
import { validateCompanyTaxNumber } from "@swan-io/shared-business/src/utils/validation";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { combineValidators, hasDefinedKeys, useForm } from "react-ux-form";
import { match } from "ts-pattern";
import { LakeCompanyInput } from "../../components/LakeCompanyInput";
import { OnboardingFooter } from "../../components/OnboardingFooter";
import { OnboardingStepContent } from "../../components/OnboardingStepContent";
import { StepTitle } from "../../components/StepTitle";
import {
  AccountCountry,
  CompanyType,
  GetCompanyInfoDocument,
  UpdateCompanyOnboardingDocument,
} from "../../graphql/unauthenticated";
import { CompanySuggestion } from "../../utils/Pappers";
import { env } from "../../utils/env";
import { locale, t } from "../../utils/i18n";
import { logFrontendError } from "../../utils/logger";
import { CompanyOnboardingRoute, Router } from "../../utils/routes";
import {
  getRegistrationNumberName,
  getUpdateOnboardingError,
} from "../../utils/templateTranslations";
import {
  ServerInvalidFieldCode,
  extractServerValidationErrors,
  getValidationErrorMessage,
  validateRequired,
  validateRequiredBoolean,
  validateVatNumber,
} from "../../utils/validation";

export type Organisation1FieldName =
  | "name"
  | "registrationNumber"
  | "vatNumber"
  | "taxIdentificationNumber"
  | "address"
  | "city"
  | "postalCode";

const styles = StyleSheet.create({
  registrationHelp: {
    marginTop: negativeSpacings[4],
  },
});

type Props = {
  previousStep: CompanyOnboardingRoute;
  nextStep: CompanyOnboardingRoute;
  companyType: CompanyType;
  initialIsRegistered?: boolean;
  initialName: string;
  initialRegistrationNumber: string;
  initialVatNumber: string;
  initialTaxIdentificationNumber: string;
  initialAddressLine1: string;
  initialCity: string;
  initialPostalCode: string;
  country: CountryCCA3;
  accountCountry: AccountCountry;
  onboardingId: string;
  serverValidationErrors: {
    fieldName: Organisation1FieldName;
    code: ServerInvalidFieldCode;
  }[];
};

const associationRegisterNamePerCountry: Partial<Record<CountryCCA3, string>> = {
  FRA: "Journal officiel des associations JOAFE",
};

const selfEmployedRegisterNamePerCountry: Partial<Record<CountryCCA3, string>> = {
  FRA: "Registre du Commerce et des Sociétés (RCS) or INSEE",
};

const registerNamePerCountry: Partial<Record<CountryCCA3, string>> = {
  BEL: "Code des Sociétés et des Associations (CSA)",
  DEU: "Handelsregister",
  FRA: "Registre du Commerce et des Sociétés (RCS)",
  ITA: "Registro Imprese",
  NLD: "Handelsregister",
  ESP: "Registrado Mercantil",
};

export const OnboardingCompanyOrganisation1 = ({
  previousStep,
  nextStep,
  companyType,
  initialIsRegistered,
  initialName,
  initialRegistrationNumber,
  initialVatNumber,
  initialTaxIdentificationNumber,
  initialAddressLine1,
  initialCity,
  initialPostalCode,
  country,
  accountCountry,
  onboardingId,
  serverValidationErrors,
}: Props) => {
  const [updateResult, updateOnboarding] = useUrqlMutation(UpdateCompanyOnboardingDocument);
  const isFirstMount = useFirstMountState();
  const canSetTaxIdentification = match({ accountCountry, country })
    .with({ accountCountry: "DEU", country: "DEU" }, () => true)
    .with({ accountCountry: "ESP", country: "ESP" }, () => true)
    .otherwise(() => false);
  const isTaxIdentificationRequired = match({ accountCountry, country })
    .with({ accountCountry: "ESP", country: "ESP" }, () => true)
    .otherwise(() => false);

  const { Field, FieldsListener, submitForm, setFieldValue, setFieldError } = useForm({
    isRegistered: {
      initialValue: initialIsRegistered,
      validate: validateRequiredBoolean,
    },
    name: {
      initialValue: initialName,
      validate: validateRequired,
      sanitize: value => value.trim(),
    },
    registrationNumber: {
      initialValue: initialRegistrationNumber,
      validate: (value, { getFieldState }) => {
        const isRegistered = getFieldState("isRegistered").value;
        return isRegistered === true ? validateRequired(value) : undefined;
      },
      sanitize: value => value.trim(),
    },
    vatNumber: {
      initialValue: initialVatNumber,
      validate: validateVatNumber,
      sanitize: value => value.trim(),
    },
    taxIdentificationNumber: {
      initialValue: initialTaxIdentificationNumber,
      validate: canSetTaxIdentification
        ? combineValidators(
            isTaxIdentificationRequired && validateRequired,
            validateCompanyTaxNumber(accountCountry),
          )
        : undefined,
      sanitize: value => value.trim(),
    },
    address: {
      initialValue: initialAddressLine1,
      validate: validateRequired,
      sanitize: value => value.trim(),
    },
    city: {
      initialValue: initialCity,
      validate: validateRequired,
      sanitize: value => value.trim(),
    },
    postalCode: {
      initialValue: initialPostalCode,
      validate: validateRequired,
      sanitize: value => value.trim(),
    },
  });

  useEffect(() => {
    if (isFirstMount) {
      serverValidationErrors.forEach(({ fieldName, code }) => {
        const message = getValidationErrorMessage(code);
        setFieldError(fieldName, message);
      });
    }
  }, [serverValidationErrors, isFirstMount, setFieldError]);

  const onPressPrevious = () => {
    Router.push(previousStep, { onboardingId });
  };

  const onPressNext = () => {
    submitForm(values => {
      if (
        !hasDefinedKeys(values, [
          "isRegistered",
          "name",
          "registrationNumber",
          "vatNumber",
          "address",
          "city",
          "postalCode",
        ])
      ) {
        return;
      }
      const {
        isRegistered,
        name,
        registrationNumber,
        vatNumber,
        taxIdentificationNumber,
        address,
        city,
        postalCode,
      } = values;

      updateOnboarding({
        input: {
          onboardingId,
          isRegistered,
          name,
          registrationNumber,
          vatNumber: emptyToUndefined(vatNumber),
          taxIdentificationNumber: emptyToUndefined(taxIdentificationNumber ?? ""),
          residencyAddress: {
            addressLine1: address,
            city,
            postalCode,
          },
          language: locale.language,
        },
        language: locale.language,
      })
        .mapOk(data => data.unauthenticatedUpdateCompanyOnboarding)
        .mapOkToResult(filterRejectionsToResult)
        .tapOk(() => Router.push(nextStep, { onboardingId }))
        .tapError(error => {
          match(error)
            .with({ __typename: "ValidationRejection" }, error => {
              const invalidFields = extractServerValidationErrors(error, path =>
                match(path)
                  .with(["registrationNumber"] as const, ([fieldName]) => fieldName)
                  .with(["vatNumber"] as const, ([fieldName]) => fieldName)
                  .with(["taxIdentificationNumber"] as const, ([fieldName]) => fieldName)
                  .with(["residencyAddress", "addressLine1"], () => "address" as const)
                  .with(["residencyAddress", "city"] as const, ([, fieldName]) => fieldName)
                  .with(["residencyAddress", "postalCode"] as const, ([, fieldName]) => fieldName)
                  .otherwise(() => null),
              );
              invalidFields.forEach(({ fieldName, code }) => {
                const message = getValidationErrorMessage(code, values[fieldName]);
                setFieldError(fieldName, message);
              });
            })
            .otherwise(noop);

          const errorMessage = getUpdateOnboardingError(error);
          showToast({
            variant: "error",
            title: errorMessage.title,
            description: errorMessage.description,
          });
        });
    });
  };

  const [siren, setSiren] = useState<string>();

  const { data } = useUrqlQuery(
    { query: GetCompanyInfoDocument, variables: { siren: siren as string }, pause: siren == null },
    [siren],
  );

  const companyInfo = data
    .toOption()
    .flatMap(result => result.toOption())
    .map(companyInfo => companyInfo.companyInfoBySiren)
    .toUndefined();

  useEffect(() => {
    match(companyInfo)
      .with({ __typename: "CompanyInfoBySirenSuccessPayload" }, ({ companyInfo }) => {
        const { companyName, siren, headquarters, vatNumber } = companyInfo;

        setFieldValue("name", companyName);
        setFieldValue("registrationNumber", siren);
        setFieldValue("vatNumber", vatNumber ?? "");
        setFieldValue("address", headquarters.address);
        setFieldValue("city", headquarters.town);
        setFieldValue("postalCode", headquarters.zipCode);
      })
      .otherwise(() => {
        if (siren != null) {
          setFieldValue("registrationNumber", siren);
        }
      });
  }, [companyInfo, setFieldValue, siren]);

  const onSelectCompany = useCallback(({ siren }: CompanySuggestion) => {
    setSiren(siren);
  }, []);

  const countryRegisterName = match(companyType)
    .with("Association", () => associationRegisterNamePerCountry[country])
    .with("SelfEmployed", () => selfEmployedRegisterNamePerCountry[country])
    .otherwise(() => registerNamePerCountry[country]);

  const onSuggestion = useCallback(
    (place: AddressDetail) => {
      setFieldValue("address", place.completeAddress);
      setFieldValue("city", place.city);
      if (place.postalCode != null) {
        setFieldValue("postalCode", place.postalCode);
      }
    },
    [setFieldValue],
  );

  return (
    <>
      <OnboardingStepContent>
        <ResponsiveContainer breakpoint={breakpoints.medium}>
          {({ small }) => (
            <>
              <StepTitle isMobile={small}>{t("company.step.organisation1.title")}</StepTitle>
              <Space height={small ? 24 : 32} />

              <Tile
                footer={
                  accountCountry === "DEU" && country === "DEU" ? (
                    <LakeAlert
                      variant="info"
                      anchored={true}
                      title={t("taxIdentificationNumber.germanInfo")}
                    />
                  ) : undefined
                }
              >
                <Field name="isRegistered">
                  {({ value, error, onChange, ref }) => (
                    <LakeLabel
                      label={
                        countryRegisterName != null
                          ? t("company.step.organisation1.isRegisteredWithNameLabel", {
                              countryRegisterName,
                            })
                          : t("company.step.organisation1.isRegisteredLabel")
                      }
                      render={() => (
                        <>
                          <LakeText variant="smallRegular" style={styles.registrationHelp}>
                            {t("company.step.organisation1.isRegisteredLabel.description", {
                              registrationNumberLegalName: getRegistrationNumberName(
                                country,
                                companyType,
                              ),
                            })}
                          </LakeText>

                          <Space height={8} />

                          <View tabIndex={-1} ref={ref}>
                            <RadioGroup
                              direction="row"
                              error={error}
                              items={[
                                { name: t("common.yes"), value: true },
                                { name: t("common.no"), value: false },
                              ]}
                              value={value}
                              onValueChange={onChange}
                            />
                          </View>
                        </>
                      )}
                    />
                  )}
                </Field>

                <Field name="name">
                  {({ value, valid, error, onChange, ref }) => (
                    <LakeLabel
                      label={t("company.step.organisation1.organisationLabel")}
                      render={id =>
                        country === "FRA" ? (
                          <LakeCompanyInput
                            id={id}
                            ref={ref}
                            value={value}
                            placeholder={t("company.step.organisation1.organisationPlaceholder")}
                            error={error}
                            onValueChange={onChange}
                            onSuggestion={onSelectCompany}
                            onLoadError={logFrontendError}
                          />
                        ) : (
                          <LakeTextInput
                            id={id}
                            ref={ref}
                            value={value}
                            placeholder={t("company.step.organisation1.organisationPlaceholder")}
                            valid={valid}
                            error={error}
                            onChangeText={onChange}
                          />
                        )
                      }
                    />
                  )}
                </Field>

                <Space height={12} />

                <FieldsListener names={["isRegistered"]}>
                  {({ isRegistered }) => (
                    <Field name="registrationNumber">
                      {({ value, valid, error, onChange, ref }) => (
                        <LakeLabel
                          label={t("company.step.organisation1.registrationNumberLabel", {
                            registrationNumberLegalName: getRegistrationNumberName(
                              country,
                              companyType,
                            ),
                          })}
                          optionalLabel={
                            isRegistered.value === true ? undefined : t("common.optional")
                          }
                          render={id => (
                            <LakeTextInput
                              id={id}
                              ref={ref}
                              placeholder={t(
                                "company.step.organisation1.registrationNumberPlaceholder",
                              )}
                              value={value}
                              valid={valid}
                              // when we set isRegistered to false, validation on registrationNumber isn't triggered
                              error={isRegistered.value === true ? error : undefined}
                              onChangeText={onChange}
                            />
                          )}
                        />
                      )}
                    </Field>
                  )}
                </FieldsListener>

                <Space height={12} />

                <Field name="vatNumber">
                  {({ value, valid, error, onChange, ref }) => (
                    <LakeLabel
                      label={t("company.step.organisation1.vatLabel")}
                      optionalLabel={t("common.optional")}
                      render={id => (
                        <LakeTextInput
                          id={id}
                          ref={ref}
                          placeholder={t("company.step.organisation1.vatPlaceholder")}
                          value={value}
                          valid={valid}
                          error={error}
                          onChangeText={onChange}
                        />
                      )}
                    />
                  )}
                </Field>

                {canSetTaxIdentification && (
                  <>
                    <Space height={12} />

                    <Field name="taxIdentificationNumber">
                      {({ value, valid, error, onChange, onBlur, ref }) => (
                        <TaxIdentificationNumberInput
                          ref={ref}
                          value={value}
                          error={error}
                          valid={valid}
                          onChange={onChange}
                          onBlur={onBlur}
                          accountCountry={accountCountry}
                          isCompany={true}
                          required={isTaxIdentificationRequired}
                        />
                      )}
                    </Field>
                  </>
                )}
              </Tile>

              <Space height={small ? 24 : 32} />
              <StepTitle isMobile={small}>{t("company.step.organisation1.addressTitle")}</StepTitle>
              <Space height={small ? 24 : 32} />

              <Tile>
                <Field name="address">
                  {({ ref, value, onChange, error }) => (
                    <LakeLabel
                      label={t("company.step.organisation1.addressLabel")}
                      render={id => (
                        <PlacekitAddressSearchInput
                          inputRef={ref}
                          apiKey={env.PLACEKIT_API_KEY}
                          emptyResultText={t("common.noResult")}
                          placeholder={t("company.step.organisation1.addressPlaceholder")}
                          language={locale.language}
                          id={id}
                          country={country}
                          value={value}
                          error={error}
                          onValueChange={onChange}
                          onSuggestion={onSuggestion}
                        />
                      )}
                    />
                  )}
                </Field>

                <Space height={12} />

                <Field name="city">
                  {({ ref, value, valid, error, onChange }) => (
                    <LakeLabel
                      label={t("company.step.organisation1.cityLabel")}
                      render={id => (
                        <LakeTextInput
                          ref={ref}
                          id={id}
                          value={value}
                          valid={valid}
                          error={error}
                          onChangeText={onChange}
                        />
                      )}
                    />
                  )}
                </Field>

                <Space height={12} />

                <Field name="postalCode">
                  {({ ref, value, valid, error, onChange }) => (
                    <LakeLabel
                      label={t("company.step.organisation1.postCodeLabel")}
                      render={id => (
                        <LakeTextInput
                          ref={ref}
                          id={id}
                          value={value}
                          valid={valid}
                          error={error}
                          onChangeText={onChange}
                        />
                      )}
                    />
                  )}
                </Field>
              </Tile>
            </>
          )}
        </ResponsiveContainer>

        <OnboardingFooter
          onPrevious={onPressPrevious}
          onNext={onPressNext}
          loading={updateResult.isLoading()}
        />
      </OnboardingStepContent>
    </>
  );
};
